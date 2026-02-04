import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  constructor() {}
  private USER_KEY = 'auth-user';
  private LOCATION_KEY = 'info_location';

  clean(): void {
    window.sessionStorage.clear();
  }

  public saveUser(user: any): void {
    window.sessionStorage.removeItem(this.USER_KEY);
    window.sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  public getUser(): any {
    const user = window.sessionStorage.getItem(this.USER_KEY);
    if (user) {
      return JSON.parse(user);
    }

    return null;
  }

  public isLoggedIn(): boolean {
    const user = window.sessionStorage.getItem(this.USER_KEY);
    if (user) {
      return true;
    }

    return false;
  }

  public saveLocation(data: any): void {
    window.sessionStorage.removeItem(this.LOCATION_KEY);
    window.sessionStorage.setItem(this.LOCATION_KEY, JSON.stringify(data));
  }

  public getLocation() {
    const location = window.sessionStorage.getItem(this.LOCATION_KEY);
    if (location) {
      return JSON.parse(location);
    }
    return null;
  }

  setVariable(key: string, value: unknown): void {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }

  getVariable<T>(key: string): T | null {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  hasKey(key: string): boolean {
    return window.sessionStorage.getItem(key) != null;
  }
}
