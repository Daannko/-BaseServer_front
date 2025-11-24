import { Component, ElementRef, Input, ViewChild, OnInit, OnDestroy, AfterViewInit, TemplateRef } from '@angular/core';
import { BoardTile } from './board-tile.data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { NavbarService } from '../../../service/navbar.service';
import { SvgIconComponent } from '../../../helpers/svg-icon/svg-icon.component';

@Component({
  selector: 'app-board-tile',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  templateUrl: './board-tile.component.html',
  styleUrl: './board-tile.component.scss'
})
export class BoardTileComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() tile!: BoardTile;
  @ViewChild('titleElement', { static: false }) titleElement!: ElementRef;
  @ViewChild('contentElement', { static: false }) contentElement!: ElementRef;
  @ViewChild('navbarContentTemplate', { static: false }) navbarContentTemplate!: TemplateRef<any>;
  @ViewChild('navbarTitleTemplate', { static: false }) navbarTitleTemplate!: TemplateRef<any>;

  titleEditor!: Editor;
  contentEditor!: Editor;

  constructor(private navbarService: NavbarService) {
  }

  ngOnInit() {
    // Initialize after view is ready
    setTimeout(() => this.initEditors(), 0);
  }

  ngAfterViewInit(){
    const root = this.contentElement.nativeElement as HTMLElement;

    // When user clicks inside this tile, publish its navbar template so the top navbar can render
    const titleRoot = this.titleElement && (this.titleElement.nativeElement as HTMLElement);
    const contentRoot = this.contentElement && (this.contentElement.nativeElement as HTMLElement);

    if (titleRoot) {
      titleRoot.addEventListener('click', () => this.setNavbarContext(this.navbarTitleTemplate));
    }
    if (contentRoot) {
      contentRoot.addEventListener('click', () => this.setNavbarContext(this.navbarContentTemplate));
    }

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
      const anchor = el && el.closest ? el.closest('a') as HTMLAnchorElement|null : null;
      if (anchor && anchor.href && anchor.href.startsWith('tile:')) {
        root.style.cursor = 'pointer';
        return;
      }

      // default: text caret
      root.style.cursor = 'text';
    });
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
      ],
      content: this.tile.label || '<p></p>',
      onUpdate: ({ editor }) => {
        this.tile.label = editor.getHTML();
      },
      editorProps: {
        attributes: {
          class: 'title-content',
          placeholder: 'Untitled'
        }
      }
    });

    // Content editor - full features
    this.contentEditor = new Editor({
      element: this.contentElement.nativeElement,
      extensions: [
        StarterKit,
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
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
      editorProps: {
        attributes: {
          class: 'content-area'
        }
      }
    });
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
      toggleBulletList: this.toggleBulletList.bind(this),
      toggleOrderedList: this.toggleOrderedList.bind(this),
      insertTable: this.insertTable.bind(this),
      setLink: this.setLink.bind(this),
      setAlignment: this.setAlignment.bind(this),
    };
  }

  setNavbarContext(template: TemplateRef<any>) {
    if (template) {
      this.navbarService.setTemplate(template, this.getNavbarContext());
    }
  }

  // Toolbar actions - operate on content editor
  toggleBold(editor: Editor) {
    editor.chain().focus().toggleBold().run();
  }

  toggleItalic(editor: Editor) {
    editor.chain().focus().toggleItalic().run();
  }

  toggleBulletList(editor: Editor) {
    editor.chain().focus().toggleBulletList().run();
  }

  toggleOrderedList(editor: Editor) {
    editor.chain().focus().toggleOrderedList().run();
  }

  insertTable(editor: Editor) {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  setLink(editor: Editor) {
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  setAlignment(editor: Editor, align: 'left' | 'center' | 'right',) {
    editor.chain().focus().setTextAlign(align).run();
  }

  getDisplayText(html: string): string {
    return html.replace(/<\/?p[^>]*>/g, '').trim();
  }
}
