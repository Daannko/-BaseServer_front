import { Injectable, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import DOMPurify from 'dompurify';

import {
  PersistentSelection,
  PersistentSelectionKey,
} from '../../../helpers/tiptap/PersistentSelector';
import type { BoardTile } from './board-tile.data';

type SelectionRange = { from: number; to: number };

@Injectable()
export class TiptapService {
  titleEditor?: Editor;
  contentEditor?: Editor;

  disableTextDrag = true;
  isTableActive = false;

  private lastTitleSelection: SelectionRange | null = null;
  private lastContentSelection: SelectionRange | null = null;

  readonly colors = [
    '#ffffff',
    '#e6ebf0',
    '#ffd54f',
    '#ff6b6b',
    '#4ecdc4',
    '#45b7d1',
    '#96ceb4',
    '#dda15e',
    '#bc6c25',
    '#111111',
  ];

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
    { name: '12px', value: '12px' },
    { name: '14px', value: '14px' },
    { name: '16px', value: '16px' },
    { name: '18px', value: '18px' },
    { name: '20px', value: '20px' },
    { name: '24px', value: '24px' },
    { name: '28px', value: '28px' },
    { name: '32px', value: '32px' },
  ];

  constructor(private sanitizer: DomSanitizer) {}

  initEditors(options: {
    tile: BoardTile;
    titleElement: HTMLElement;
    contentElement: HTMLElement;
  }) {
    const { tile, titleElement, contentElement } = options;

    // Destroy any existing editors (can happen if tile is re-rendered)
    this.destroyEditors();

    const titleHtml =
      this.sanitizer.sanitize(SecurityContext.HTML, tile.label as any) ||
      '<p></p>';

    this.titleEditor = new Editor({
      element: titleElement,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        PersistentSelection,
        TextStyle,
        Color.configure({ types: ['textStyle'] }),
        FontFamily,
      ],
      content: titleHtml,
      onFocus: () => {
        this.clearPersistentSelectionDecoration(this.contentEditor);
        this.lastContentSelection = null;
      },
      onUpdate: ({ editor }) => {
        this.updateLabel(tile, editor.getHTML());
      },
      onSelectionUpdate: ({ editor }) => {
        this.captureLastSelection(editor);
      },
      editorProps: {
        attributes: {
          class: 'title-content',
          placeholder: 'Untitled',
        },
      },
    });

    this.contentEditor = new Editor({
      element: contentElement,
      extensions: [
        StarterKit,
        TextStyle,
        Color.configure({ types: ['textStyle'] }),
        FontFamily,
        Table.configure({
          resizable: true,
          allowTableNodeSelection: true,
        }),
        TableRow,
        PersistentSelection,
        TableHeader,
        TableCell,
        FontSize,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'tile-link',
          },
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
      ],
      content: tile.content || '<p></p>',
      onFocus: () => {
        this.clearPersistentSelectionDecoration(this.titleEditor);
        this.lastTitleSelection = null;
      },
      onUpdate: ({ editor }) => {
        tile.content = editor.getHTML();
      },
      onSelectionUpdate: ({ editor }) => {
        this.detectTableContext(editor);
        this.captureLastSelection(editor);
      },
      editorProps: {
        attributes: {
          class: 'content-area',
        },
      },
    });

    this.applyDisableTextDrag(this.disableTextDrag);
  }

  destroyEditors() {
    try {
      this.titleEditor?.destroy();
    } catch {}
    try {
      this.contentEditor?.destroy();
    } catch {}
    this.titleEditor = undefined;
    this.contentEditor = undefined;
  }

  clearSelectionHighlight() {
    this.lastTitleSelection = null;
    this.lastContentSelection = null;

    try {
      this.titleEditor?.commands?.blur();
    } catch {}
    try {
      this.contentEditor?.commands?.blur();
    } catch {}

    this.clearPersistentSelectionDecoration(this.titleEditor);
    this.clearPersistentSelectionDecoration(this.contentEditor);
    queueMicrotask(() => {
      this.clearPersistentSelectionDecoration(this.titleEditor);
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

  private updateLabel(tile: BoardTile, label: string) {
    const clean = DOMPurify.sanitize(label, {
      ALLOWED_TAGS: [
        'p',
        'span',
        'b',
        'i',
        'u',
        'br',
        'em',
        'strong',
        's',
        'del',
        'code',
        'pre',
        'blockquote',
        'ul',
        'ol',
        'li',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'a',
      ],
      ALLOWED_ATTR: ['style', 'href', 'class'],
    });
    tile.label = this.sanitizer.bypassSecurityTrustHtml(clean);
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

    patchEditor(this.titleEditor);
    patchEditor(this.contentEditor);
  }

  detectTableContext(editor: Editor) {
    this.isTableActive =
      editor.isActive('tableCell') || editor.isActive('tableHeader');
  }

  private captureLastSelection(editor: Editor) {
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selection = { from: Math.min(from, to), to: Math.max(from, to) };
    if (editor === this.titleEditor) {
      this.lastTitleSelection = selection;
    } else if (editor === this.contentEditor) {
      this.lastContentSelection = selection;
    }
  }

  private getLastSelection(editor: Editor): SelectionRange | null {
    if (editor === this.titleEditor) return this.lastTitleSelection;
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
    editor.chain().focus().toggleCodeBlock().run();
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
    const { from, to } = editor.state.selection;
    const last = this.getLastSelection(editor);
    const canRestore =
      from === to &&
      last &&
      typeof last.from === 'number' &&
      last.from < last.to;

    const chain = editor.chain().focus();

    if (canRestore) {
      chain.setTextSelection({ from: last.from, to: last.to });
    } else if (from === to) {
      chain.selectAll();
    }

    chain.setMark('textStyle', { color }).run();
  }

  setFont(fontFamily: string, editor: Editor) {
    const { from, to } = editor.state.selection;
    const last = this.getLastSelection(editor);
    const canRestore =
      from === to &&
      last &&
      typeof last.from === 'number' &&
      last.from < last.to;

    const chain = editor.chain().focus();

    if (canRestore) {
      chain.setTextSelection({ from: last.from, to: last.to });
    } else if (from === to) {
      chain.selectAll();
    }

    chain.setFontFamily(fontFamily).run();
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

  setFontSize(fontSize: string, editor: Editor) {
    const { from, to } = editor.state.selection;
    const last = this.getLastSelection(editor);
    const canRestore =
      from === to &&
      last &&
      typeof last.from === 'number' &&
      last.from < last.to;

    const chain = editor.chain().focus();

    if (canRestore) {
      chain.setTextSelection({ from: last.from, to: last.to });
    } else if (from === to) {
      chain.selectAll();
    }

    chain.setMark('textStyle', { fontSize }).run();
  }

  applyFontSize(input: string, editor: Editor) {
    const fontSize = this.normalizeFontSize(input);
    if (!fontSize) return;

    this.setFontSize(fontSize, editor);
  }

  private normalizeFontSize(input: string): string | null {
    const raw = (input || '').trim();
    if (!raw) return null;

    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      return `${raw}px`;
    }

    if (
      /^\d+(?:\.\d+)?(px|em|rem|%|pt|pc|cm|mm|in|vh|vw|vmin|vmax|ch|ex)$/.test(
        raw,
      )
    ) {
      return raw;
    }

    const compact = raw.replace(/\s+/g, '').toLowerCase();
    if (
      /^\d+(?:\.\d+)?(px|em|rem|%|pt|pc|cm|mm|in|vh|vw|vmin|vmax|ch|ex)$/.test(
        compact,
      )
    ) {
      return compact;
    }

    return null;
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
