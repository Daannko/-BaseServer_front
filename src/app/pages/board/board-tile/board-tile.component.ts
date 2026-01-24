import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnInit,
  OnDestroy,
  AfterViewInit,
  TemplateRef,
  HostListener,
  SecurityContext,
} from '@angular/core';
import { BoardTile } from './board-tile.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CellSelection } from '@tiptap/pm/tables';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import { QuerySelectComponent } from '../../common/query-select/query-select.component';
import Color from '@tiptap/extension-color';
import DOMPurify from 'dompurify';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  PersistentSelection,
  PersistentSelectionKey,
} from '../../../helpers/tiptap/PersistentSelector';
import { TileRect, TileResizeDirective } from './tile.resize.directive';
import { TileMoveDirective, Position } from './tile.move.directive';
import { BoardMainService } from '../board.main.service';

@Component({
  selector: 'app-board-tile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SvgIconComponent,
    QuerySelectComponent,
    TileResizeDirective,
    TileMoveDirective,
  ],
  templateUrl: './board-tile.component.html',
  styleUrl: './board-tile.component.scss',
})
export class BoardTileComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() tile!: BoardTile;
  @Input() zoom = 1;
  @Output() navbarChange = new EventEmitter<{
    template: TemplateRef<any>;
    context: any;
  }>();
  @ViewChild('titleElement', { static: false }) titleElement!: ElementRef;
  @ViewChild('contentElement', { static: false }) contentElement!: ElementRef;
  @ViewChild('navbarContentTemplate', { static: false })
  navbarContentTemplate!: TemplateRef<any>;
  @ViewChild('navbarTitleTemplate', { static: false })
  navbarTitleTemplate!: TemplateRef<any>;

  titleEditor!: Editor;
  contentEditor!: Editor;
  isColorPaletteVisible: boolean = false;
  isTableActive: boolean = false;

  private navbarPinned = false;
  private isDraggingTile = false;

  // Options
  disableTextDrag = true;

  private lastTitleSelection: { from: number; to: number } | null = null;
  private lastContentSelection: { from: number; to: number } | null = null;

  private clearPersistentSelectionDecoration(editor?: Editor) {
    const view = (editor as any)?.view;
    if (!view) return;
    view.dispatch(
      view.state.tr.setMeta(PersistentSelectionKey, { type: 'focus' }),
    );
  }

  /**
   * Called by the board when clicking empty background.
   * Ensures no persistent selection highlight remains visible.
   */
  clearSelectionHighlight() {
    this.lastTitleSelection = null;
    this.lastContentSelection = null;

    // Blur both editors (if one is focused) to remove native selection paint.
    try {
      this.titleEditor?.commands?.blur();
    } catch {}
    try {
      this.contentEditor?.commands?.blur();
    } catch {}

    // Clear persistent-selection decoration immediately and again after blur handlers run.
    this.clearPersistentSelectionDecoration(this.titleEditor);
    this.clearPersistentSelectionDecoration(this.contentEditor);
    queueMicrotask(() => {
      this.clearPersistentSelectionDecoration(this.titleEditor);
      this.clearPersistentSelectionDecoration(this.contentEditor);
    });
  }

  colors = [
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

  fonts = [
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

  fontSizes = [
    { name: '12px', value: '12px' },
    { name: '14px', value: '14px' },
    { name: '16px', value: '16px' },
    { name: '18px', value: '18px' },
    { name: '20px', value: '20px' },
    { name: '24px', value: '24px' },
    { name: '28px', value: '28px' },
    { name: '32px', value: '32px' },
  ];

  constructor(
    private sanitizer: DomSanitizer,
    private host: ElementRef<HTMLElement>,
    private mainBoardService: BoardMainService,
  ) {}

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const target = ev.target as HTMLElement | null;

    // Never clear while interacting with the top navbar / search UI.
    if (target?.closest('app-navbar') || target?.closest('.search-window')) {
      return;
    }

    // If click is inside this tile (including its editors), don't clear.
    if (this.host.nativeElement.contains(target as Node)) {
      return;
    }

    // Click was outside this tile: clear its selection highlight.
    this.clearSelectionHighlight();

    // If this tile was providing the navbar, allow it to be virtualized again.
    this.navbarPinned = false;
    if (!this.isDraggingTile) {
      this.tile.forceToRender = false;
    }
  }

  ngOnInit() {
    // Initialize after view is ready
    setTimeout(() => this.initEditors(), 0);
  }

  ngAfterViewInit() {
    const root = this.contentElement.nativeElement as HTMLElement;

    // When user clicks inside this tile, publish its navbar template so the top navbar can render
    const titleRoot =
      this.titleElement && (this.titleElement.nativeElement as HTMLElement);
    const contentRoot =
      this.contentElement && (this.contentElement.nativeElement as HTMLElement);

    if (titleRoot) {
      titleRoot.addEventListener('click', () => {
        this.requestNavbar(this.navbarTitleTemplate);
      });
    }
    if (contentRoot) {
      contentRoot.addEventListener('click', () => {
        this.requestNavbar(this.navbarContentTemplate);
      });
    }

    // Listen for mouseup anywhere to detect text selection that ends outside the editor
    document.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        const isInTitle = titleRoot && titleRoot.contains(selection.anchorNode);
        const isInContent =
          contentRoot && contentRoot.contains(selection.anchorNode);

        if (isInTitle) {
          this.requestNavbar(this.navbarTitleTemplate);
        } else if (isInContent) {
          this.requestNavbar(this.navbarContentTemplate);
        }
      }
    });

    root.addEventListener('mousemove', (e: MouseEvent) => {
      const el = (e.target as HTMLElement) || null;
      // If hovering a real <a> element, pointer
      if (el && el.closest && el.closest('a')) {
        root.style.cursor = 'pointer';
        return;
      }

      // If hovering image, show grab
      if (el && el.tagName === 'IMG') {
        root.style.cursor = 'grab';
        return;
      }

      // Custom link scheme example: check nearest anchor href
      const anchor =
        el && el.closest ? (el.closest('a') as HTMLAnchorElement | null) : null;
      if (anchor && anchor.href && anchor.href.startsWith('tile:')) {
        root.style.cursor = 'pointer';
        return;
      }
      root.style.cursor = 'text';
    });
  }

  onTileWorldRectChange(r: TileRect) {
    this.tile.x = r.x;
    this.tile.y = r.y;
    this.tile.width = r.width;
    this.tile.height = r.height;

    this.tile.updateSize(this.zoom);
    this.tile.updatePosition(
      this.mainBoardService.cameraX,
      this.mainBoardService.cameraY,
      this.zoom,
    );

    // This might not be the best ... will see
    for (const connector of this.tile.connectors) {
      connector.updateAngles();
      connector.updatePosition();
    }
  }

  onTileWorldPosChange(p: Position) {
    this.tile.x = p.x;
    this.tile.y = p.y;

    this.tile.updatePosition(
      this.mainBoardService.cameraX,
      this.mainBoardService.cameraY,
      this.zoom,
    );

    for (const connector of this.tile.connectors) {
      connector.updateAngles();
      connector.updatePosition();
    }
  }

  updateLabel(label: string) {
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
    this.tile.label = this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  initEditors() {
    // Title editor - simple, no toolbar features
    const titleHtml =
      this.sanitizer.sanitize(SecurityContext.HTML, this.tile.label as any) ||
      '<p></p>';

    this.titleEditor = new Editor({
      element: this.titleElement.nativeElement,
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
        // Switching to title: clear any persistent highlight from content.
        this.clearPersistentSelectionDecoration(this.contentEditor);
        this.lastContentSelection = null;
      },
      onUpdate: ({ editor }) => {
        this.updateLabel(editor.getHTML());
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

    // Content editor - full features
    this.contentEditor = new Editor({
      element: this.contentElement.nativeElement,
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
      content: this.tile.content || '<p></p>',
      onFocus: () => {
        // Switching to content: clear any persistent highlight from title.
        this.clearPersistentSelectionDecoration(this.titleEditor);
        this.lastTitleSelection = null;
      },
      onUpdate: ({ editor }) => {
        this.tile.content = editor.getHTML();
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
              if (!this.disableTextDrag) return false; // allow default ProseMirror behavior
              ev.preventDefault();
              return true; // handled
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

  private getLastSelection(
    editor: Editor,
  ): { from: number; to: number } | null {
    if (editor === this.titleEditor) return this.lastTitleSelection;
    if (editor === this.contentEditor) return this.lastContentSelection;
    return null;
  }

  ngOnDestroy() {
    if (this.titleEditor) {
      this.titleEditor.destroy();
    }
    if (this.contentEditor) {
      this.contentEditor.destroy();
    }
  }

  private getNavbarContext() {
    return {
      tile: this.tile,
      toggleBold: this.toggleBold.bind(this),
      toggleItalic: this.toggleItalic.bind(this),
      toggleUnderline: this.toggleUnderline.bind(this),
      toggleStrikethrough: this.toggleStrikethrough.bind(this),
      toggleQuote: this.toggleQuote.bind(this),
      toggleBulletList: this.toggleBulletList.bind(this),
      toggleOrderedList: this.toggleOrderedList.bind(this),
      toggleCodeBlock: this.toggleCodeBlock.bind(this),
      insertTable: this.insertTable.bind(this),
      addColumnBefore: this.addColumnBefore.bind(this),
      addColumnAfter: this.addColumnAfter.bind(this),
      deleteColumn: this.deleteColumn.bind(this),
      addRowBefore: this.addRowBefore.bind(this),
      addRowAfter: this.addRowAfter.bind(this),
      deleteRow: this.deleteRow.bind(this),
      deleteTable: this.deleteTable.bind(this),
      mergeCells: this.mergeCells.bind(this),
      splitCell: this.splitCell.bind(this),
      toggleHeaderColumn: this.toggleHeaderColumn.bind(this),
      toggleHeaderRow: this.toggleHeaderRow.bind(this),
      toggleHeaderCell: this.toggleHeaderCell.bind(this),
      mergeOrSplit: this.mergeOrSplit.bind(this),
      fixTables: this.fixTables.bind(this),
      goToNextCell: this.goToNextCell.bind(this),
      goToPreviousCell: this.goToPreviousCell.bind(this),
      alignTableLeft: this.alignTableLeft.bind(this),
      alignTableCenter: this.alignTableCenter.bind(this),
      alignTableRight: this.alignTableRight.bind(this),
      setLink: this.setLink.bind(this),
      setAlignment: this.setAlignment.bind(this),
      setTextColor: this.setTextColor.bind(this),
      setFont: this.setFont.bind(this),
      setFontSize: this.setFontSize.bind(this),
      isTableActive: this.isTableActive,
      fonts: this.fonts,
      fontSizes: this.fontSizes,
      colors: this.colors,
    };
  }

  requestNavbar(template: TemplateRef<any>) {
    if (!template) return;

    // Keep tile rendered while its template is being used by the global navbar.
    this.navbarPinned = true;
    this.tile.forceToRender = true;

    this.navbarChange.emit({
      template,
      context: this.getNavbarContext(),
    });
  }

  onMoveStart() {
    this.isDraggingTile = true;
    this.tile.forceToRender = true;
  }

  onMoveEnd() {
    this.isDraggingTile = false;
    if (!this.navbarPinned) {
      this.tile.forceToRender = false;
    }
  }

  // Toolbar actions
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

    // If selection got lost due to clicking toolbar UI, restore it.
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

    // If selection got lost due to clicking toolbar UI, restore it.
    if (canRestore) {
      chain.setTextSelection({ from: last.from, to: last.to });
    } else if (from === to) {
      chain.selectAll();
    }

    // Apply font using the official FontFamily extension command
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

    // If selection got lost due to clicking toolbar UI, restore it.
    if (canRestore) {
      chain.setTextSelection({ from: last.from, to: last.to });
    } else if (from === to) {
      chain.selectAll();
    }

    // Apply font size using textStyle mark
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

    // Allow just a number (treated as px)
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      return `${raw}px`;
    }

    // Allow common CSS length units
    if (
      /^\d+(?:\.\d+)?(px|em|rem|%|pt|pc|cm|mm|in|vh|vw|vmin|vmax|ch|ex)$/.test(
        raw,
      )
    ) {
      return raw;
    }

    // If user typed something like "16 px" or "16PX", try a forgiving parse
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

  // Table manipulation methods
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

    // Walk up the tree to find the table
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        // Found table at depth d
        // Get table start position
        const tableStart = $from.start(d);

        // Apply styles directly to the table DOM element
        const view = (editor as any).view;
        const dom = view.domAtPos(tableStart).node;
        const el = dom.nodeType === 3 ? dom.parentElement : dom;
        const table = el.closest('table');

        if (table) {
          // Apply specific alignment
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
