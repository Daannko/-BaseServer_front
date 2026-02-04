import type { JSONContent } from '@tiptap/core';

export function emptyDoc(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function isProseMirrorDoc(value: unknown): value is JSONContent {
  const v = value as any;
  return !!v && v.type === 'doc' && Array.isArray(v.content);
}

export function docFromText(text: string): JSONContent {
  const safeText = String(text ?? '').trim();
  if (!safeText) return emptyDoc();
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: safeText }],
      },
    ],
  };
}

function tryParseJson(value: string): unknown | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Returns a ProseMirror/Tiptap JSON doc.
 * - If `value` is already a doc, returns it.
 * - If `value` is a JSON string containing a doc, parses and returns it.
 * - Otherwise returns an empty doc.
 */
export function getDoc(value?: unknown): JSONContent {
  if (!value) return emptyDoc();

  if (isProseMirrorDoc(value)) return value;

  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (parsed && isProseMirrorDoc(parsed)) return parsed;
    // Back-compat / convenience: treat plain strings as text content.
    return docFromText(value);
  }

  return emptyDoc();
}
