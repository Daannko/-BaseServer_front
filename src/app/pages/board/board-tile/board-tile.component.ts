import {
  Component,
  ElementRef,
  Input,
  ViewChild,
  OnInit,
  OnDestroy,
  AfterViewInit,
  TemplateRef,
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
import { NavbarService } from '../../../service/navbar.service';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';
import Color from '@tiptap/extension-color';
import DOMPurify from 'dompurify';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-board-tile',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  templateUrl: './board-tile.component.html',
  styleUrl: './board-tile.component.scss',
})
export class BoardTileComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() tile!: BoardTile;
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
    private navbarService: NavbarService,
    private sanitizer: DomSanitizer
  ) {}

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
        this.setNavbarContext(this.navbarTitleTemplate);
      });
    }
    if (contentRoot) {
      contentRoot.addEventListener('click', () => {
        this.setNavbarContext(this.navbarContentTemplate);
        console.log(this.tile.content);
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
          this.setNavbarContext(this.navbarTitleTemplate);
        } else if (isInContent) {
          this.setNavbarContext(this.navbarContentTemplate);
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

      // default: text caret
      root.style.cursor = 'text';
    });
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
        TextStyle,
        Color.configure({ types: ['textStyle'] }),
        FontFamily,
      ],
      content: this.tile.label || '<p></p>',
      onUpdate: ({ editor }) => {
        this.updateLabel(editor.getHTML());
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
        }),
        TableRow,
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
      onUpdate: ({ editor }) => {
        this.tile.content = editor.getHTML();
      },
      onSelectionUpdate: ({ editor }) => {
        this.detectTableContext(editor);
      },
      editorProps: {
        attributes: {
          class: 'content-area',
        },
      },
    });
  }

  detectTableContext(editor: Editor) {
    this.isTableActive =
      editor.isActive('tableCell') || editor.isActive('tableHeader');
    
    // Highlight selected cells
    this.highlightSelectedCells(editor);
  }

  highlightSelectedCells(editor: Editor) {
    // Clear previous highlights
    const allCells = this.contentElement.nativeElement.querySelectorAll('td, th');
    allCells.forEach((cell: HTMLElement) => {
      cell.classList.remove('selectedCell');
    });

    // Check if we have a CellSelection
    const selection = editor.state.selection;
    if (selection && selection.constructor.name === 'CellSelection') {
      // We have a cell selection - highlight all selected cells
      const cellSelection = selection as any;
      const { $anchorCell, $headCell } = cellSelection;
      
      if ($anchorCell && $headCell) {
        // Get the table and cells positions
        const table = $anchorCell.node(-1);
        const tableStart = $anchorCell.start(-1);
        
        // Find all cells and determine which are selected
        let cellIndex = 0;
        allCells.forEach((cell: HTMLElement) => {
          // Check if this cell is within the selection range
          const cellPos = tableStart + cellIndex;
          
          // Simple approach: check if cell has selection-related attributes
          // TipTap adds data-selected or similar during cell selection
          if (cell.hasAttribute('data-selected') || 
              cell.classList.contains('selectedCell') ||
              this.isCellInSelection(editor, cell)) {
            cell.classList.add('selectedCell');
          }
          cellIndex++;
        });
      }
    }
  }

  isCellInSelection(editor: Editor, cellElement: HTMLElement): boolean {
    // Get cell position in editor
    const view = (editor as any).view;
    const domNode = cellElement;
    
    try {
      const pos = view.posAtDOM(domNode, 0);
      const resolvedPos = editor.state.doc.resolve(pos);
      
      // Check if position is in a cell
      return resolvedPos.parent.type.spec['tableRole'] === 'cell' ||
             resolvedPos.parent.type.spec['tableRole'] === 'header_cell';
    } catch {
      return false;
    }
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

  setNavbarContext(template: TemplateRef<any>) {
    if (template) {
      this.navbarService.setTemplate(template, this.getNavbarContext());
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

    // If no text is selected, select all
    if (from === to) {
      editor.chain().focus().selectAll().run();
    }

    editor.chain().focus().setMark('textStyle', { color }).run();
  }

  setFont(fontFamily: string, editor: Editor) {
    const { from, to } = editor.state.selection;

    // If no text is selected, select all
    if (from === to) {
      editor.chain().focus().selectAll().run();
    }

    // Apply font using the official FontFamily extension command
    editor.chain().focus().setFontFamily(fontFamily).run();
  }

  setFontSize(fontSize: string, editor: Editor) {
    const { from, to } = editor.state.selection;

    // If no text is selected, select all
    if (from === to) {
      editor.chain().focus().selectAll().run();
    }

    // Apply font size using textStyle mark
    editor.chain().focus().setMark('textStyle', { fontSize }).run();
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
}
