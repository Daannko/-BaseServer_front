import { Injectable, NgZone } from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { CodeBlock } from '@tiptap/extension-code-block';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import { RichTextService } from '../../../helpers/rich-text.service';

import {
  PersistentSelection,
  PersistentSelectionKey,
} from '../../../helpers/tiptap/PersistentSelector';
import type { BoardTile } from './board-tile.data';
import { ParagraphAttrPlugin, ParagraphWithMarks } from './tiptap.extension';

type SelectionRange = { from: number; to: number };

@Injectable()
export class TiptapService {
  contentEditor?: Editor;

  disableTextDrag = true;
  isTableActive = false;
  currentFont = '';
  currentSize = '';

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
  ) {}

  initEditors(options: {
    tile: BoardTile;
    contentElement: HTMLElement;
  }) {
    const { tile, contentElement } = options;

    // Destroy any existing editors (can happen if tile is re-rendered)
    this.destroyEditors();

    this.contentEditor = new Editor({
      element: contentElement,
      extensions: [
        ParagraphWithMarks,
        StarterKit.configure({ paragraph: false }),
        TextStyle,
        FontSize,
        Color.configure({ types: ['textStyle'] }),
        FontFamily,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),

        ParagraphAttrPlugin,
        PersistentSelection,
      ],
      content: tile.content,
      onFocus: ({ editor }) => {
        this.lastContentSelection = null;
        this.updateCurrentStyles(editor);
        this.onFocusCallback?.();
      },
      onUpdate: ({ editor }) => {
        tile.content = editor.getJSON();
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
      this.contentEditor?.commands?.blur();
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
    editor.chain().setMark('textStyle', { color }).run();
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
    const chain = editor
      .chain()
      .focus()
      .setMark('textStyle', { fontSize: normalized });
    chain.run();
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
    const current = editor.getAttributes('textStyle')['fontSize'] as string | undefined;
    const num = parseInt(current ?? '14', 10);
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
