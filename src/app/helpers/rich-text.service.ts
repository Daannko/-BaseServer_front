import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { generateHTML, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import DOMPurify from 'dompurify';

@Injectable({ providedIn: 'root' })
export class RichTextService {
  private readonly renderExtensions = [
    StarterKit.configure({
      link: {
        openOnClick: false,
        HTMLAttributes: {
          class: 'tile-link',
        },
      },
    }),
    TextStyle,
    Color.configure({ types: ['textStyle'] }),
    FontFamily,
    Table.configure({ resizable: true, allowTableNodeSelection: true }),
    TableRow,
    TableHeader,
    TableCell,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ];

  constructor(private sanitizer: DomSanitizer) {}

  getEmptyDoc(): JSONContent {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  getDocOrEmpty(value: string): JSONContent {
    const parsed = this.tryParseJson(value);
    if (parsed && this.isProseMirrorDoc(parsed)) {
      return parsed;
    }
    return this.getEmptyDoc();
  }

  renderDocToSafeHtml(doc: JSONContent): SafeHtml {
    const html = generateHTML(doc, this.renderExtensions);
    const clean = this.sanitizeHtml(html);
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  renderJsonToSafeHtml(value: JSONContent): SafeHtml {
    return this.renderDocToSafeHtml(value);
  }

  private tryParseJson(value: string): any | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  private isProseMirrorDoc(value: any): value is JSONContent {
    return !!value && value.type === 'doc' && Array.isArray(value.content);
  }

  private sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
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
      ALLOWED_URI_REGEXP: /^https?:\/\//i,
    });
  }
}
