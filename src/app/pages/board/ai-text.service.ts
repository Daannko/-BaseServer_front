import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';

/**
 * Renders a small, safe markdown subset used by AI quiz/chat text:
 * fenced code blocks (```), inline code (`), **bold**, *italic*, and newlines.
 * Everything is HTML-escaped first, then re-sanitized with DOMPurify.
 */
@Injectable({ providedIn: 'root' })
export class AiTextService {
  constructor(private sanitizer: DomSanitizer) {}

  /** Render markdown text to sanitized SafeHtml for [innerHTML]. */
  render(src: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.toHtml(src ?? ''));
  }

  private toHtml(src: string): string {
    const blocks: string[] = [];
    const inlines: string[] = [];
    let s = src;

    // 1. Fenced code blocks: ```lang\n…``` → placeholder
    s = s.replace(/```[ \t]*([\w+-]*)\n?([\s\S]*?)```/g, (_m, _lang, body) => {
      const html = `<pre class="ai-code"><code>${this.esc(
        body.replace(/\n$/, ''),
      )}</code></pre>`;
      return `@@B${blocks.push(html) - 1}@@`;
    });

    // 2. Inline code: `…` → placeholder
    s = s.replace(/`([^`\n]+)`/g, (_m, body) => {
      const html = `<code class="ai-inline-code">${this.esc(body)}</code>`;
      return `@@I${inlines.push(html) - 1}@@`;
    });

    // 3. Escape the remaining prose
    s = this.esc(s);

    // 4. Bold / italic (after escaping; placeholders are untouched)
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, '<em>$1</em>');

    // 5. Newlines → <br>
    s = s.replace(/\n/g, '<br>');

    // 6. Restore code placeholders
    s = s.replace(/@@B(\d+)@@/g, (_m, i) => blocks[+i] ?? '');
    s = s.replace(/@@I(\d+)@@/g, (_m, i) => inlines[+i] ?? '');

    return DOMPurify.sanitize(s, {
      ALLOWED_TAGS: ['pre', 'code', 'strong', 'em', 'b', 'i', 'br', 'span'],
      ALLOWED_ATTR: ['class'],
    });
  }

  private esc(t: string): string {
    return t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
