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

export function docFromTextWithFontSize(
  text: string,
  fontSize: number,
): JSONContent {
  const safeText = String(text ?? '').trim();
  const sizeStr = `${Math.round(fontSize)}px`;
  const textStyleMark = { type: 'textStyle', attrs: { fontSize: sizeStr } };
  const content = safeText
    ? [{ type: 'text', text: safeText, marks: [textStyleMark] }]
    : [];
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { storedMarks: [textStyleMark] },
        content,
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
export function extractPlainText(doc: JSONContent | undefined): string {
  if (!doc) return '';
  if (doc.text) return doc.text as string;
  if (doc.content) return doc.content.map(extractPlainText).join('');
  return '';
}

/** Copy of `doc` with the open state of its nth details node flipped, counting
 *  in document order (the order querySelectorAll gives on the rendered HTML). */
export function toggleDetailsAt(doc: JSONContent, index: number): JSONContent {
  const next = structuredClone(doc);
  let seen = 0;
  const visit = (node: JSONContent): boolean => {
    if (node.type === 'details' && seen++ === index) {
      node.attrs = { ...node.attrs, open: !node.attrs?.['open'] };
      return true;
    }
    return (node.content ?? []).some(visit);
  };
  visit(next);
  return next;
}

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

/** Readable plain text of a note, for pasting into other apps: one line per
 *  paragraph, "- " / "1. " list items, tab-separated table cells. */
export function docToPlainText(doc: JSONContent | undefined): string {
  return blockLines(doc ?? {}, '').join('\n').trimEnd();
}

function inlineText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

function blockLines(node: JSONContent, indent: string): string[] {
  const kids = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'detailsSummary':
    case 'codeBlock':
      return inlineText(node).split('\n').map((line) => indent + line);
    case 'bulletList':
    case 'orderedList':
      return kids.flatMap((item, i) => {
        const mark =
          node.type === 'orderedList' ? `${(node.attrs?.['start'] ?? 1) + i}. ` : '- ';
        const lines = (item.content ?? []).flatMap((c) => blockLines(c, indent + '  '));
        if (lines.length) lines[0] = indent + mark + lines[0].slice(indent.length + 2);
        return lines;
      });
    case 'table':
      return kids.map(
        (row) =>
          indent +
          (row.content ?? [])
            .map((cell) => (cell.content ?? []).flatMap((c) => blockLines(c, '')).join(' '))
            .join('\t'),
      );
    case 'blockquote':
      return kids.flatMap((c) => blockLines(c, indent + '> '));
    case 'horizontalRule':
      return [indent + '---'];
    default:
      // doc, details, detailsContent: hidden text is copied as shown open.
      return kids.flatMap((c) => blockLines(c, indent));
  }
}
