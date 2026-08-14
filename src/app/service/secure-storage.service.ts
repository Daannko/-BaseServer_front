import { Injectable } from '@angular/core';

/**
 * Encrypted wrapper around `localStorage` for content that must survive a
 * browser restart without being readable by anyone poking through the
 * browser's storage (DevTools "Application" tab, profile files on disk, a
 * synced-profile copy, ...). Values are AES-GCM-256 encrypted; what lands in
 * localStorage is `enc1:<base64(iv || ciphertext)>`.
 *
 * Key handling — and the honest limits of client-side encryption:
 * - The key is generated once per browser profile as a NON-extractable
 *   WebCrypto `CryptoKey` and stored in IndexedDB. It cannot be exported —
 *   inspecting IndexedDB shows an opaque key object, never key bytes, and
 *   the ciphertext in localStorage is useless without it.
 * - This defeats reading the data at rest out of storage. It does NOT defend
 *   against code running on this origin (an XSS payload, or the user's own
 *   console on the live page) — such code can call decrypt just like we do.
 *   True secrecy against that would need a server-held or password-derived
 *   key, which costs a login/passphrase before any local restore.
 * - If the user clears IndexedDB but not localStorage, old ciphertext becomes
 *   permanently unreadable; reads then behave as "nothing stored".
 *
 * Fail-closed: when WebCrypto/IndexedDB are unavailable (SSR, non-secure
 * origin), writes are dropped rather than stored as plaintext.
 */
@Injectable({ providedIn: 'root' })
export class SecureStorageService {
  private static readonly DB_NAME = 'bs-secure-store';
  private static readonly DB_STORE = 'keys';
  private static readonly DB_KEY_ID = 'aes-gcm-v1';
  private static readonly PREFIX = 'enc1:';
  private static readonly IV_BYTES = 12;

  private keyPromise: Promise<CryptoKey | null> | null = null;
  private warned = false;

  get available(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.indexedDB &&
      !!globalThis.crypto?.subtle
    );
  }

  /** Encrypt and store. Returns false (and stores nothing) when encryption
   *  is impossible — callers must treat that as "not persisted". */
  async setJson(key: string, value: unknown): Promise<boolean> {
    const cryptoKey = await this.getKey();
    if (!cryptoKey) return false;
    try {
      const plain = new TextEncoder().encode(JSON.stringify(value));
      const iv = crypto.getRandomValues(
        new Uint8Array(SecureStorageService.IV_BYTES),
      );
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        plain,
      );
      const packed = new Uint8Array(iv.length + cipher.byteLength);
      packed.set(iv);
      packed.set(new Uint8Array(cipher), iv.length);
      localStorage.setItem(
        key,
        SecureStorageService.PREFIX + toBase64(packed),
      );
      return true;
    } catch (e) {
      this.warnOnce('Secure local write failed', e);
      return false;
    }
  }

  /** Read and decrypt. Returns null when missing, undecryptable (key was
   *  cleared / data corrupt) or crypto is unavailable. A legacy PLAINTEXT
   *  value under the same key is read once and immediately re-written
   *  encrypted, so pre-encryption data migrates transparently. */
  async getJson<T>(key: string): Promise<T | null> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return null;
    }
    if (!raw) return null;

    if (!raw.startsWith(SecureStorageService.PREFIX)) {
      try {
        const legacy = JSON.parse(raw) as T;
        void this.setJson(key, legacy);
        return legacy;
      } catch {
        return null;
      }
    }

    const cryptoKey = await this.getKey();
    if (!cryptoKey) return null;
    try {
      const packed = fromBase64(
        raw.slice(SecureStorageService.PREFIX.length),
      );
      const iv = packed.slice(0, SecureStorageService.IV_BYTES);
      const data = packed.slice(SecureStorageService.IV_BYTES);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data,
      );
      return JSON.parse(new TextDecoder().decode(plain)) as T;
    } catch {
      return null;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  private getKey(): Promise<CryptoKey | null> {
    if (!this.keyPromise) this.keyPromise = this.loadOrCreateKey();
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<CryptoKey | null> {
    if (!this.available) {
      this.warnOnce(
        'Secure storage unavailable (no WebCrypto/IndexedDB) — local snapshots are disabled rather than written as plaintext.',
      );
      return null;
    }
    try {
      // Generate a candidate key BEFORE the IndexedDB transaction (an idb txn
      // auto-commits if we await anything else inside it), then do a
      // get-or-put in one readwrite txn so two racing tabs settle on one key.
      const candidate = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable: the key bytes can never be read out
        ['encrypt', 'decrypt'],
      );
      const db = await this.openDb();
      try {
        return await new Promise<CryptoKey>((resolve, reject) => {
          const txn = db.transaction(
            SecureStorageService.DB_STORE,
            'readwrite',
          );
          const store = txn.objectStore(SecureStorageService.DB_STORE);
          const getReq = store.get(SecureStorageService.DB_KEY_ID);
          getReq.onsuccess = () => {
            const existing = getReq.result;
            if (existing instanceof CryptoKey) {
              resolve(existing);
              return;
            }
            store.put(candidate, SecureStorageService.DB_KEY_ID);
            resolve(candidate);
          };
          getReq.onerror = () => reject(getReq.error);
          txn.onerror = () => reject(txn.error);
        });
      } finally {
        db.close();
      }
    } catch (e) {
      this.warnOnce('Secure storage key setup failed', e);
      return null;
    }
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SecureStorageService.DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (
          !req.result.objectStoreNames.contains(SecureStorageService.DB_STORE)
        ) {
          req.result.createObjectStore(SecureStorageService.DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private warnOnce(msg: string, e?: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(msg, e ?? '');
  }
}

// btoa/atob work on "binary strings"; convert in chunks so multi-MB boards
// don't blow the argument limit of String.fromCharCode.
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
