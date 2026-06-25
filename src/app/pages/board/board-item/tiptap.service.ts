import { Injectable, NgZone } from '@angular/core';
import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { Code } from '@tiptap/extension-code';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { BackgroundColor, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import { RichTextService } from '../../../helpers/rich-text.service';
import { DEFAULT_PALETTE_COLORS } from '../../common/color-palette/color-palette.component';

import {
  PersistentSelection,
  PersistentSelectionKey,
} from '../../../helpers/tiptap/PersistentSelector';
import type { BoardItem } from './board-item.data';
import { BoardLink, ParagraphAttrPlugin, ParagraphWithMarks, TabIndent } from './tiptap.extension';
import { BoardLinkService } from '../board-link.service';
import { EditorPrefsService } from '../board-editor-prefs.service';

type SelectionRange = { from: number; to: number };

/** Shared lowlight registry for code-block syntax highlighting. Only the
 *  languages offered in the picker are registered (keeps the bundle small vs
 *  highlight.js's full `common` set). Created once — registration is global. */
const lowlight = createLowlight();
lowlight.register({
  bash, c, cpp, csharp, css, go, java, javascript, json, kotlin,
  markdown, php, python, ruby, rust, sql, typescript, xml, yaml,
});

/** The font size to give a new code block: the textStyle size active at the
 *  cursor, else the last size used before it — so the block keeps the size the
 *  user was working in instead of resetting to the note default. */
function currentFontSize(state: EditorState): string | null {
  const marks = state.storedMarks || state.selection.$from.marks();
  const active = marks.find((m) => m.type.name === 'textStyle');
  if (active?.attrs?.['fontSize']) return active.attrs['fontSize'] as string;

  // Cursor's own marks had none (e.g. a fresh line) — use the nearest preceding
  // run that did carry a fontSize.
  let last: string | null = null;
  state.doc.nodesBetween(0, state.selection.from, (node) => {
    if (!node.isText) return true;
    const ts = node.marks.find((m) => m.type.name === 'textStyle');
    if (ts?.attrs?.['fontSize']) last = ts.attrs['fontSize'] as string;
    return true;
  });
  return last;
}

/**
 * Syntax-highlighted code block (lowlight) with two tweaks:
 *  - a `fontSize` node attribute (rendered on <pre>) so the block keeps the
 *    font size that was active when it was created, not the note default;
 *  - a custom ``` input rule with no leading anchor, so typing ``` mid-line
 *    breaks to a new line and starts the code block fresh.
 */
const HighlightedCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) =>
          el.style.fontSize || el.getAttribute('data-font-size') || null,
        renderHTML: (attrs: Record<string, any>) =>
          attrs['fontSize']
            ? {
                style: `font-size: ${attrs['fontSize']}`,
                'data-font-size': attrs['fontSize'],
              }
            : {},
      },
    };
  },

  // All ``` handling lives in one text-input hook, so it triggers on the 3rd
  // backtick itself — no trailing space, and any character typed afterwards
  // lands inside the block:
  //   - outside a code block: ``` starts one (breaking to a new line if there's
  //     text before the fence), keeping the current font size;
  //   - inside a code block: ``` alone on a line exits it.
  addProseMirrorPlugins() {
    const parent = this.parent?.() ?? [];
    const type = this.type;
    return [
      ...parent,
      new Plugin({
        props: {
          handleTextInput: (view, from, _to, text) => {
            if (text !== '`') return false;
            const { state } = view;
            const $from = state.selection.$from;
            const before = $from.parent.textBetween(0, $from.parentOffset);
            const line = before.slice(before.lastIndexOf('\n') + 1);
            // The two chars before the cursor must be backticks (this is the 3rd).
            if (!line.endsWith('``')) return false;

            const paragraph = state.schema.nodes['paragraph'];
            const tr = state.tr;

            if ($from.parent.type === type) {
              // ── Inside a code block: exit when the fence is alone on its line ──
              if (line !== '``') return false;
              const hasContentBefore = before.length > line.length;
              const delFrom = hasContentBefore ? from - 3 : from - 2;
              tr.delete(delFrom, from);

              const $cb = tr.doc.resolve(delFrom);
              if ($cb.parent.type === type && $cb.parent.content.size === 0) {
                const at = $cb.start();
                tr.setBlockType(at, at, paragraph);
                tr.setSelection(TextSelection.create(tr.doc, at));
              } else {
                const after = $cb.after();
                const para = paragraph.createAndFill();
                if (!para) return false;
                tr.insert(after, para);
                tr.setSelection(TextSelection.create(tr.doc, after + 1));
              }
              view.dispatch(tr.scrollIntoView());
              return true;
            }

            // ── Outside a code block: start one on the 3rd backtick ──
            const fontSize = currentFontSize(state);
            const twoStart = from - 2; // the two existing backticks
            tr.delete(twoStart, from);
            if (line.length > 2) {
              // Text precedes the fence — drop the code block on the next line
              // (insert a real node rather than split+convert, which is
              // off-by-one against the split boundary tokens).
              const codeNode = type.createAndFill({ language: null, fontSize });
              if (!codeNode) return false;
              const insertAt = tr.doc.resolve(twoStart).after();
              tr.insert(insertAt, codeNode);
              tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
            } else {
              // Fence alone on the line — convert it in place.
              tr.setBlockType(twoStart, twoStart, type, { language: null, fontSize });
              tr.setSelection(TextSelection.create(tr.doc, twoStart));
            }
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});

@Injectable()
export class TiptapService {
  contentEditor?: Editor;

  disableTextDrag = true;
  isTableActive = false;
  isCodeBlockActive = false;
  currentCodeLanguage = 'plaintext';
  currentFont = '';
  currentSize = '';

  /** Languages offered in the code-block language picker. `value` must match a
   *  highlight.js name registered in the `common` set above. */
  readonly codeLanguages = [
    { name: 'Plain text', value: 'plaintext' },
    { name: 'Bash', value: 'bash' },
    { name: 'C', value: 'c' },
    { name: 'C++', value: 'cpp' },
    { name: 'C#', value: 'csharp' },
    { name: 'CSS', value: 'css' },
    { name: 'Go', value: 'go' },
    { name: 'HTML/XML', value: 'xml' },
    { name: 'Java', value: 'java' },
    { name: 'JavaScript', value: 'javascript' },
    { name: 'JSON', value: 'json' },
    { name: 'Kotlin', value: 'kotlin' },
    { name: 'Markdown', value: 'markdown' },
    { name: 'PHP', value: 'php' },
    { name: 'Python', value: 'python' },
    { name: 'Ruby', value: 'ruby' },
    { name: 'Rust', value: 'rust' },
    { name: 'SQL', value: 'sql' },
    { name: 'TypeScript', value: 'typescript' },
    { name: 'YAML', value: 'yaml' },
  ];

  private lastContentSelection: SelectionRange | null = null;

  readonly colors = DEFAULT_PALETTE_COLORS;

  readonly fonts = [
    {
      name: 'Default',
      value:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    { name: 'Serif', value: 'Georgia, "Times New Roman", serif' },
    { name: 'Monospace', value: '"Courier New", monospace' },
    { name: 'Cursive', value: 'cursive' },
    { name: 'Comic Sans', value: '"Comic Sans MS", cursive' },
    { name: 'Arial', value: 'Arial, sans-serif' },
  ];

  readonly fontSizes = [
    { name: '12', value: '12px' },
    { name: '14', value: '14px' },
    { name: '16', value: '16px' },
    { name: '18', value: '18px' },
    { name: '20', value: '20px' },
    { name: '24', value: '24px' },
    { name: '28', value: '28px' },
    { name: '32', value: '32px' },
  ];

  constructor(
    private richText: RichTextService,
    private ngZone: NgZone,
    private boardLink: BoardLinkService,
    private editorPrefs: EditorPrefsService,
  ) {}

  /** Begin linking the current selection to a board element. Returns false if
   *  nothing is selected (the menu button requires an active selection). */
  beginBoardLink(sourceId?: string): boolean {
    if (!this.contentEditor) return false;
    return this.boardLink.beginLink(this.contentEditor, sourceId);
  }

  initEditors(options: {
    tile: BoardItem;
    contentElement: HTMLElement;
  }) {
    const { tile, contentElement } = options;

    // Destroy any existing editors (can happen if tile is re-rendered)
    this.destroyEditors();

    this.contentEditor = new Editor({
      element: contentElement,
      extensions: [
        ParagraphWithMarks,
        StarterKit.configure({ paragraph: false, code: false, codeBlock: false }),
        // tiptap's default Code mark sets `excludes: '_'`, which strips every
        // other mark (incl. textStyle carrying fontSize/color) the moment code
        // is applied — so `code` reset to the note's default font. We still want
        // code to keep the surrounding font size/color, but excluding *nothing*
        // also let the bold/italic/strike input rules fire inside inline code:
        // typing `*x*` inside `code` turned into italic. Exclude only the
        // formatting marks (not textStyle) — this both blocks those marks inside
        // code and, because markInputRule bails when a range mark excludes the
        // new mark, leaves the literal `*`/`_`/`~` characters intact.
        Code.extend({ excludes: 'bold italic strike' }),
        // Syntax-highlighted code block (``` fence). Replaces StarterKit's plain
        // codeBlock so language can be picked and tokens get colored via lowlight.
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

        ParagraphAttrPlugin,
        BoardLink,
        TabIndent,
        PersistentSelection,
      ],
      content: tile.content,
      onCreate: ({ editor }) => {
        // Empty / un-tagged content (fresh note, or one whose runs carry no
        // fontSize mark): seed the user's last-used font size so a new note
        // starts in the size you were just working in — NOT a size-derived
        // default. Content already carrying per-run fontSize marks (e.g. loaded
        // from the server) keeps its own sizes.
        if (!contentHasFontSize(tile.content)) {
          const sz = `${this.editorPrefs.lastFontSize}px`;
          editor.chain().selectAll().setFontSize(sz).run();
        }
      },
      onFocus: ({ editor }) => {
        this.lastContentSelection = null;
        this.detectTableContext(editor);
        this.updateCurrentStyles(editor);
        this.onFocusCallback?.();
      },
      onUpdate: ({ editor }) => {
        tile.content = editor.getJSON();
        this.reseedEmptyFontSize(editor);
        this.detectTableContext(editor);
        this.updateCurrentStyles(editor);
      },
      onSelectionUpdate: ({ editor }) => {
        this.detectTableContext(editor);
        this.captureLastSelection(editor);
        this.updateCurrentStyles(editor);
      },
      editorProps: {
        attributes: {
          class: 'content-area',
        },
      },
    });

    this.applyDisableTextDrag(this.disableTextDrag);
  }

  /**
   * For components that create their own Editor (e.g. board-section's name
   * editor) but still want currentFont/currentSize tracking for toolbars.
   * Call from the editor's onFocus/onUpdate/onSelectionUpdate.
   */
  trackStyles(editor: Editor) {
    this.updateCurrentStyles(editor);
  }

  destroyEditors() {
    try {
      this.contentEditor?.destroy();
    } catch {}
    this.contentEditor = undefined;
  }

  onFocusCallback: (() => void) | null = null;

  get hasActiveSelection(): boolean {
    if (!this.contentEditor) return false;
    const { from, to } = this.contentEditor.state.selection;
    return from !== to;
  }

  clearSelectionHighlight() {
    this.lastContentSelection = null;

    try {
      // Only blur if THIS editor actually holds focus. tiptap's blur() command
      // schedules `window.getSelection().removeAllRanges()` in a rAF, which wipes
      // the document-wide selection — not just this editor's. clearSelectionHighlight
      // runs on every note's editor on each document mousedown, so blurring a note
      // that isn't focused would erase the caret in the note you just clicked into,
      // one frame later (a race that made notes randomly un-typeable). Guarding on
      // isFocused keeps the intended "blur on click-away" while leaving other
      // editors' selections alone.
      if (this.contentEditor?.isFocused) this.contentEditor.commands.blur();
    } catch {}

    this.clearPersistentSelectionDecoration(this.contentEditor);
    queueMicrotask(() => {
      this.clearPersistentSelectionDecoration(this.contentEditor);
    });
  }

  private clearPersistentSelectionDecoration(editor?: Editor) {
    const view = (editor as any)?.view;
    if (!view) return;
    view.dispatch(
      view.state.tr.setMeta(PersistentSelectionKey, { type: 'focus' }),
    );
  }

  applyDisableTextDrag(disabled: boolean) {
    this.disableTextDrag = disabled;

    const patchEditor = (editor?: Editor) => {
      if (!editor) return;

      const currentProps = editor.options.editorProps ?? {};
      const currentEvents = (currentProps as any).handleDOMEvents ?? {};

      editor.setOptions({
        editorProps: {
          ...currentProps,
          handleDOMEvents: {
            ...currentEvents,

            dragstart: (_view: any, ev: DragEvent) => {
              if (!this.disableTextDrag) return false;
              ev.preventDefault();
              return true;
            },

            drop: (_view: any, ev: DragEvent) => {
              if (!this.disableTextDrag) return false;
              ev.preventDefault();
              return true;
            },
          },
        },
      });
    };

    patchEditor(this.contentEditor);
  }

  detectTableContext(editor: Editor) {
    this.isTableActive =
      editor.isActive('tableCell') || editor.isActive('tableHeader');

    this.isCodeBlockActive = editor.isActive('codeBlock');
    this.currentCodeLanguage = this.isCodeBlockActive
      ? editor.getAttributes('codeBlock')?.['language'] || 'plaintext'
      : 'plaintext';
  }

  /** Friendly label for the active code-block language (for the picker input). */
  get currentCodeLanguageName(): string {
    const match = this.codeLanguages.find(
      (l) => l.value === this.currentCodeLanguage,
    );
    return match ? match.name : this.currentCodeLanguage;
  }

  /** Commit from the searchable picker. Accepts a friendly name (e.g. "Python"),
   *  a highlight.js id ("python"), or any custom text; resolves to the id. */
  applyCodeLanguage(input: string, editor: Editor) {
    const q = (input || '').trim().toLowerCase();
    if (!q) return;
    const match = this.codeLanguages.find(
      (l) => l.name.toLowerCase() === q || l.value.toLowerCase() === q,
    );
    this.setCodeBlockLanguage(match ? match.value : q, editor);
  }

  /** Set the language of the code block under the cursor (drives highlighting). */
  setCodeBlockLanguage(language: string, editor: Editor) {
    editor.chain().focus().updateAttributes('codeBlock', { language }).run();
    this.currentCodeLanguage = language;
  }

  private captureLastSelection(editor: Editor) {
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selection = { from: Math.min(from, to), to: Math.max(from, to) };
    if (editor === this.contentEditor) {
      this.lastContentSelection = selection;
    }
  }

  private getLastSelection(editor: Editor): SelectionRange | null {
    if (editor === this.contentEditor) return this.lastContentSelection;
    return null;
  }

  toggleBold(editor: Editor) {
    editor.chain().focus().toggleBold().run();
  }
  toggleItalic(editor: Editor) {
    editor.chain().focus().toggleItalic().run();
  }
  toggleUnderline(editor: Editor) {
    editor.chain().focus().toggleUnderline().run();
  }
  toggleStrikethrough(editor: Editor) {
    editor.chain().focus().toggleStrike().run();
  }
  toggleQuote(editor: Editor) {
    editor.chain().focus().toggleBlockquote().run();
  }
  toggleBulletList(editor: Editor) {
    editor.chain().focus().toggleBulletList().run();
  }
  toggleOrderedList(editor: Editor) {
    editor.chain().focus().toggleOrderedList().run();
  }
  toggleCodeBlock(editor: Editor) {
    // Carry the current font size into the block so it doesn't reset to default.
    const fontSize = currentFontSize(editor.state);
    editor.chain().focus().toggleCodeBlock({ fontSize } as any).run();
  }

  insertTable(editor: Editor) {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }

  setLink(editor: Editor) {
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  setAlignment(align: 'left' | 'center' | 'right' | 'justify', editor: Editor) {
    editor.chain().focus().setTextAlign(align).run();
  }

  setTextColor(color: string, editor: Editor) {
    editor.chain().setMark('textStyle', { color }).run();
  }

  setHighlight(color: string, editor: Editor) {
    editor.chain().setMark('textStyle', { backgroundColor: color }).run();
  }

  unsetHighlight(editor: Editor) {
    editor.chain().setMark('textStyle', { backgroundColor: null }).run();
  }

  setFont(fontFamily: string, editor: Editor) {
    editor.chain().setFontFamily(fontFamily).run();
  }

  applyFont(input: string, editor: Editor) {
    const raw = (input || '').trim();
    if (!raw) return;

    const match = this.fonts.find(
      (f) => f.name.toLowerCase() === raw.toLowerCase(),
    );
    const fontFamily = match ? match.value : raw;

    this.setFont(fontFamily, editor);
  }

  applyFontSize(size: string, editor: Editor) {
    const normalized = /^\d+$/.test(size.trim()) ? size.trim() + 'px' : size;
    // Code blocks carry no textStyle marks — their size lives on the <pre> node's
    // `fontSize` attribute, so set that instead when the cursor is inside one.
    if (editor.isActive('codeBlock')) {
      editor.chain().focus().updateAttributes('codeBlock', { fontSize: normalized }).run();
    } else {
      editor.chain().focus().setMark('textStyle', { fontSize: normalized }).run();
    }
    // Remember this as the size new/empty elements default to.
    const px = parseInt(normalized, 10);
    if (Number.isFinite(px)) this.editorPrefs.lastFontSize = px;
  }

  /** When an editor goes empty (new note, or all text deleted via Ctrl+A), seed
   *  the caret with the last-used font size so the next character typed uses it
   *  instead of falling back to the note's base size. Guarded against re-firing:
   *  the stored mark already matching means no transaction, no onUpdate loop. */
  private reseedEmptyFontSize(editor: Editor) {
    if (!editor.isEmpty) return;
    const want = `${this.editorPrefs.lastFontSize}px`;
    if (editor.getAttributes('textStyle')['fontSize'] === want) return;
    editor.chain().setMark('textStyle', { fontSize: want }).run();
  }

  private updateCurrentStyles(editor: Editor) {
    this.ngZone.run(() => {
      const { from, to } = editor.state.selection;
      const hasRange = from !== to;

      if (hasRange) {
        // Selection: collect every unique fontFamily and fontSize across text nodes
        const fonts = new Set<string>();
        const sizes = new Set<string>();

        editor.state.doc.nodesBetween(from, to, (node) => {
          if (!node.isText) return;
          const mark = node.marks.find((m) => m.type.name === 'textStyle');
          fonts.add((mark?.attrs['fontFamily'] as string) ?? '');
          sizes.add((mark?.attrs['fontSize'] as string) ?? '');
        });

        // Mixed font → empty; single value → resolve name or 'Default'
        if (fonts.size > 1) {
          this.currentFont = '';
        } else {
          const fontValue = [...fonts][0] ?? '';
          const fontMatch = this.fonts.find((f) => f.value === fontValue);
          this.currentFont = fontMatch ? fontMatch.name : 'Default';
        }

        // Mixed size → empty; single value → resolve or compute
        if (sizes.size > 1) {
          this.currentSize = '';
        } else {
          const sizeValue = ([...sizes][0] ?? '').replace('px', '');
          this.currentSize = sizeValue || this.computedSizeAt(editor, from);
        }
      } else {
        // Cursor (no selection): read marks at caret position
        const attrs = editor.getAttributes('textStyle');

        const fontValue = (attrs['fontFamily'] as string) ?? '';
        const fontMatch = this.fonts.find((f) => f.value === fontValue);
        this.currentFont = fontMatch ? fontMatch.name : 'Default';

        const sizeValue = (attrs['fontSize'] as string) ?? '';
        this.currentSize = sizeValue
          ? sizeValue.replace('px', '')
          : this.computedSizeAt(editor, from);
      }
    });
  }

  private computedSizeAt(editor: Editor, pos: number): string {
    try {
      const { node } = editor.view.domAtPos(pos);
      const el = node instanceof Element ? node : node.parentElement;
      const computed = el ? window.getComputedStyle(el).fontSize : '';
      return computed ? String(Math.round(parseFloat(computed))) : '';
    } catch {
      return '';
    }
  }

  adjustFontSize(delta: number, editor: Editor) {
    const current = editor.isActive('codeBlock')
      ? (editor.getAttributes('codeBlock')['fontSize'] as string | undefined)
      : (editor.getAttributes('textStyle')['fontSize'] as string | undefined);
    // No explicit size → fall back to the note's computed base, which scales
    // with note size (see --note-font-size), not a fixed 21px.
    const base = current ?? this.computedSizeAt(editor, editor.state.selection.from);
    const num = parseInt(base || '21', 10);
    const next = Math.max(1, num + delta);
    this.applyFontSize(String(next), editor);
  }

  getDisplayText(html: string): string {
    return html.replace(/<\/?p[^>]*>/g, '').trim();
  }

  addColumnBefore(editor: Editor) {
    editor.chain().focus().addColumnBefore().run();
  }
  addColumnAfter(editor: Editor) {
    editor.chain().focus().addColumnAfter().run();
  }
  deleteColumn(editor: Editor) {
    editor.chain().focus().deleteColumn().run();
  }
  addRowBefore(editor: Editor) {
    editor.chain().focus().addRowBefore().run();
  }
  addRowAfter(editor: Editor) {
    editor.chain().focus().addRowAfter().run();
  }
  deleteRow(editor: Editor) {
    editor.chain().focus().deleteRow().run();
  }
  deleteTable(editor: Editor) {
    editor.chain().focus().deleteTable().run();
    this.isTableActive = false;
  }
  mergeCells(editor: Editor) {
    editor.chain().focus().mergeCells().run();
  }
  splitCell(editor: Editor) {
    editor.chain().focus().splitCell().run();
  }
  toggleHeaderColumn(editor: Editor) {
    editor.chain().focus().toggleHeaderColumn().run();
  }
  toggleHeaderRow(editor: Editor) {
    editor.chain().focus().toggleHeaderRow().run();
  }
  toggleHeaderCell(editor: Editor) {
    editor.chain().focus().toggleHeaderCell().run();
  }
  mergeOrSplit(editor: Editor) {
    editor.chain().focus().mergeOrSplit().run();
  }
  fixTables(editor: Editor) {
    editor.chain().focus().fixTables().run();
  }
  goToNextCell(editor: Editor) {
    editor.chain().focus().goToNextCell().run();
  }
  goToPreviousCell(editor: Editor) {
    editor.chain().focus().goToPreviousCell().run();
  }

  alignTableLeft(editor: Editor) {
    this.alignTable(editor, 'left');
  }
  alignTableCenter(editor: Editor) {
    this.alignTable(editor, 'center');
  }
  alignTableRight(editor: Editor) {
    this.alignTable(editor, 'right');
  }

  private alignTable(editor: Editor, align: 'left' | 'center' | 'right') {
    const { $from } = editor.state.selection;

    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        const tableStart = $from.start(d);
        const view = (editor as any).view;
        const dom = view.domAtPos(tableStart).node;
        const el = dom.nodeType === 3 ? dom.parentElement : dom;
        const table = el.closest('table');

        if (table) {
          if (align === 'left') {
            table.style.marginLeft = '0';
            table.style.marginRight = 'auto';
          } else if (align === 'center') {
            table.style.marginLeft = 'auto';
            table.style.marginRight = 'auto';
          } else if (align === 'right') {
            table.style.marginLeft = 'auto';
            table.style.marginRight = '0';
          }
        }

        return;
      }
    }
  }
}

// ── Helper ──────────────────────────────────────────────────────────────────

/** True when the document JSON contains at least one fontSize mark.
 *  Used to decide whether onCreate should inject the note's base font size
 *  (skip if server-saved content already carries per-text-run sizes). */
function contentHasFontSize(doc: JSONContent): boolean {
  return JSON.stringify(doc).includes('"fontSize"');
}
