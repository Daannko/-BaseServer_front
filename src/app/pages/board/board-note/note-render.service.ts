import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getSchema, JSONContent } from '@tiptap/core';
import { DOMSerializer, Node as PMNode, Schema } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Code } from '@tiptap/extension-code';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { BackgroundColor, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import DOMPurify from 'dompurify';
import { getDoc } from '../../../helpers/rich-text.util';
import { BoardLink } from '../board-item/tiptap.extension';
import { HighlightedCodeBlock, lowlight } from '../board-item/tiptap.service';

/**
 * Renders a note's ProseMirror JSON to static HTML that looks IDENTICAL to the
 * live tiptap editor (fonts, sizes, colors, highlights, tables, board-links,
 * and syntax-highlighted code blocks) — without instantiating an Editor.
 *
 * Used so unfocused notes are plain DOM instead of 96 live contentEditable
 * editors; a real editor is only created on focus (see BoardNoteComponent).
 *
 * The extension list mirrors the editor's RENDER-relevant extensions (the
 * editing-only plugins — TabIndent, PersistentSelection — have no renderHTML
 * and are omitted). Syntax highlighting is a runtime
 * ProseMirror plugin, so generateHTML() emits plain <pre><code>; we re-apply
 * lowlight over the result so code colors match the editor.
 */
@Injectable({ providedIn: 'root' })
export class NoteRenderService {
  private readonly extensions = [
    StarterKit.configure({ code: false, codeBlock: false }),
    Code,
    HighlightedCodeBlock.configure({ lowlight, defaultLanguage: 'plaintext' }),
    TextStyle,
    FontSize,
    Color.configure({ types: ['textStyle'] }),
    BackgroundColor,
    FontFamily,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    BoardLink,
  ];

  // Schema + serializer are built ONCE. generateHTML() would rebuild the whole
  // schema from the extension list on every call — a measurable cost paid per
  // note as it scrolls into view.
  private readonly schema: Schema = getSchema(this.extensions as any);
  private readonly serializer = DOMSerializer.fromSchema(this.schema);

  // Rendered-HTML cache keyed by the content document's object identity. Lives
  // on the (root-provided) service, so it survives note components being
  // destroyed/recreated by viewport culling — re-entering the viewport is a
  // cache hit instead of a full re-render. Content edits always assign a fresh
  // doc object (editor.getJSON()), which naturally invalidates the entry.
  private readonly cache = new WeakMap<object, SafeHtml>();

  constructor(private sanitizer: DomSanitizer) {}

  /** Render note content to sanitized SafeHtml, identical to the editor. */
  render(content: unknown): SafeHtml {
    const cacheable = typeof content === 'object' && content !== null;
    if (cacheable) {
      const hit = this.cache.get(content as object);
      if (hit !== undefined) return hit;
    }

    const doc = getDoc(content);
    let html = '';
    try {
      html = this.toHtml(doc);
    } catch {
      html = '';
    }
    html = this.postProcess(html);
    const safe = this.sanitizer.bypassSecurityTrustHtml(this.sanitize(html));
    if (cacheable) this.cache.set(content as object, safe);
    return safe;
  }

  /** JSON doc → HTML string via the cached schema/serializer (what
   *  generateHTML() does internally, minus the per-call schema build). */
  private toHtml(doc: JSONContent): string {
    const node = PMNode.fromJSON(this.schema, doc);
    const fragment = this.serializer.serializeFragment(node.content);
    const div = document.createElement('div');
    div.appendChild(fragment);
    return div.innerHTML;
  }

  /** Matches paragraphs that would collapse to zero height: empty, or holding
   *  only whitespace / zero-width spaces / empty styled spans. Deliberately
   *  broad — a false positive just runs the (correct) DOM pass. */
  private static readonly EMPTY_P_RE =
    /<p[^>]*>(?:\s|​|<span[^>]*>|<\/span>)*<\/p>/;

  /** Single DOM pass over the generated HTML: keep empty paragraphs visible
   *  (blank lines) and re-apply code syntax colors. */
  private postProcess(html: string): string {
    if (!html) return html;
    // The DOM pass only ever changes empty paragraphs and <pre> code blocks.
    // Most notes have neither — skip the DOMParser round-trip for those.
    if (!html.includes('<pre') && !NoteRenderService.EMPTY_P_RE.test(html)) {
      return html;
    }
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

    // Empty paragraphs collapse to zero height as <p></p>; the editor keeps them
    // visible. Give each a <br> so blank lines (Enter on an empty line) show, at
    // the note default size — blank lines deliberately do NOT inherit an earlier
    // run's size (e.g. a big headline), matching the live editor.
    doc.querySelectorAll('p').forEach((p) => {
      const text = (p.textContent ?? '').replace(/​/g, '').trim();
      if (text !== '' || p.querySelector('br, img, hr')) return;
      p.textContent = '';
      p.appendChild(doc.createElement('br'));
    });

    this.highlightCodeBlocks(doc);
    return doc.body.innerHTML;
  }

  /** Re-apply lowlight syntax colors to <pre><code> blocks (generateHTML emits
   *  them un-highlighted because highlighting is a runtime editor plugin). */
  private highlightCodeBlocks(doc: Document): void {
    doc.querySelectorAll('pre code').forEach((code) => {
      const text = code.textContent ?? '';
      if (!text.trim()) return;
      // The language class may sit on <code> or on <pre>.
      const pre = code.closest('pre');
      const classes = [
        ...Array.from(code.classList),
        ...(pre ? Array.from(pre.classList) : []),
      ];
      const langClass = classes.find((c) => c.startsWith('language-'));
      const lang = langClass?.slice('language-'.length);
      try {
        // Match the editor: a known language uses that grammar; anything else
        // (no language / 'plaintext' / unregistered) auto-detects, exactly like
        // CodeBlockLowlight's plugin does in the live editor.
        let tree: any;
        if (lang && lang !== 'plaintext') {
          try {
            tree = lowlight.highlight(lang, text);
          } catch {
            tree = lowlight.highlightAuto(text);
          }
        } else {
          tree = lowlight.highlightAuto(text);
        }
        const inner = this.hastToHtml(tree?.children ?? []);
        if (inner) code.innerHTML = inner;
      } catch {
        /* highlighting unavailable → leave as plain text */
      }
    });
  }

  private hastToHtml(nodes: any[]): string {
    let out = '';
    for (const n of nodes) {
      if (n.type === 'text') {
        out += this.escape(n.value);
      } else if (n.type === 'element') {
        const cls = (n.properties?.className ?? []).join(' ');
        out += `<${n.tagName}${cls ? ` class="${cls}"` : ''}>`;
        out += this.hastToHtml(n.children ?? []);
        out += `</${n.tagName}>`;
      }
    }
    return out;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private sanitize(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'span', 'b', 'i', 'u', 'br', 'em', 'strong', 's', 'del',
        'code', 'pre', 'blockquote', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a',
      ],
      ALLOWED_ATTR: ['style', 'href', 'class', 'data-board-link', 'data-font-size', 'colspan', 'rowspan'],
      ALLOWED_URI_REGEXP: /^https?:\/\//i,
    });
  }
}
