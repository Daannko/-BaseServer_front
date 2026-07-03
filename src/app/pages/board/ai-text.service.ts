import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { lowlight } from './board-item/tiptap.service';

/**
 * Renders a small, safe markdown subset used by AI quiz/chat text:
 * fenced code blocks (```), inline code (`), **bold**, *italic*, headings (#),
 * lists (-/*, 1.), horizontal rules (---), tables (| … |), and paragraphs.
 * Everything is HTML-escaped first, then re-sanitized with DOMPurify.
 */
@Injectable({ providedIn: 'root' })
export class AiTextService {
  constructor(private sanitizer: DomSanitizer) {}

  /** Same input → same output, so cache it. This also keeps the bound SafeHtml
   *  reference stable across change-detection passes (Angular won't re-parse the
   *  innerHTML, so transient DOM state like a "Copied" label isn't wiped). */
  private cache = new Map<string, SafeHtml>();

  /** Render markdown text to sanitized SafeHtml for [innerHTML]. */
  render(src: string | null | undefined): SafeHtml {
    const key = src ?? '';
    let html = this.cache.get(key);
    if (!html) {
      html = this.sanitizer.bypassSecurityTrustHtml(this.toHtml(key));
      if (this.cache.size > 300) this.cache.clear();
      this.cache.set(key, html);
    }
    return html;
  }

  private toHtml(src: string): string {
    const blocks: string[] = [];
    const inlines: string[] = [];
    let s = src;

    // 1. Fenced code blocks: ```lang\n…``` → placeholder (syntax-highlighted).
    //    Pulled out first so their pipes/newlines don't confuse block parsing.
    s = s.replace(/```[ \t]*([\w+-]*)\n?([\s\S]*?)```/g, (_m, lang, body) => {
      const inner = this.highlight(lang, body.replace(/\n$/, ''));
      const html =
        `<div class="ai-code-wrap">` +
        `<button class="ai-code-copy" type="button" title="Copy code">Copy</button>` +
        `<pre class="ai-code"><code class="hljs">${inner}</code></pre>` +
        `</div>`;
      return `@@B${blocks.push(html) - 1}@@`;
    });

    // 2. Inline code: `…` → placeholder.
    s = s.replace(/`([^`\n]+)`/g, (_m, body) => {
      const html = `<code class="ai-inline-code">${this.esc(body)}</code>`;
      return `@@I${inlines.push(html) - 1}@@`;
    });

    // 3. Block-level parse (tables, headings, lists, rules, paragraphs).
    let html = this.renderBlocks(s);

    // 4. Restore code placeholders.
    html = html.replace(/@@B(\d+)@@/g, (_m, i) => blocks[+i] ?? '');
    html = html.replace(/@@I(\d+)@@/g, (_m, i) => inlines[+i] ?? '');

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'pre', 'code', 'strong', 'em', 'b', 'i', 'br', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'p',
        'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'button',
      ],
      ALLOWED_ATTR: ['class', 'style', 'type', 'title'],
    });
  }

  /** Inline formatting for a run of prose: escape, then **bold** / *italic*.
   *  Code is already extracted to placeholders, which survive untouched. */
  private inline(text: string): string {
    let s = this.esc(text);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, '<em>$1</em>');
    return s;
  }

  /** Turn the markdown subset into block-level HTML. */
  private renderBlocks(src: string): string {
    const lines = src.split('\n');
    const out: string[] = [];
    let para: string[] = [];
    let i = 0;

    const flushPara = () => {
      if (!para.length) return;
      out.push(`<p>${para.map((l) => this.inline(l)).join('<br>')}</p>`);
      para = [];
    };

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === '') { flushPara(); i++; continue; }

      // A fenced-code placeholder on its own line is a block — emit it directly
      // (not wrapped in <p>, which would be invalid around the code <div>).
      if (/^@@B\d+@@$/.test(line.trim())) {
        flushPara();
        out.push(line.trim());
        i++;
        continue;
      }

      // Table: a "| … |" row immediately followed by a "|---|---|" separator.
      if (
        line.includes('|') &&
        i + 1 < lines.length &&
        this.isTableSep(lines[i + 1])
      ) {
        flushPara();
        const aligns = this.tableAligns(lines[i + 1]);
        const header = this.tableCells(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
          rows.push(this.tableCells(lines[i]));
          i++;
        }
        out.push(this.renderTable(header, aligns, rows));
        continue;
      }

      // Heading: # … through ###### …
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara();
        const lvl = h[1].length;
        out.push(`<h${lvl}>${this.inline(h[2].trim())}</h${lvl}>`);
        i++;
        continue;
      }

      // Horizontal rule: ---, ***, ___
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        flushPara();
        out.push('<hr>');
        i++;
        continue;
      }

      // List: -, *, + (unordered) or 1. (ordered)
      const ordered = /^\s*\d+\.\s+/.test(line);
      if (ordered || /^\s*[-*+]\s+/.test(line)) {
        flushPara();
        const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
        const items: string[] = [];
        while (i < lines.length && re.test(lines[i])) {
          items.push(`<li>${this.inline(re.exec(lines[i])![1])}</li>`);
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.join('')}</${tag}>`);
        continue;
      }

      para.push(line);
      i++;
    }
    flushPara();
    return out.join('');
  }

  /** A markdown table separator row, e.g. `|---|:--:|---:|`. */
  private isTableSep(line: string): boolean {
    if (!line.includes('-')) return false;
    const cells = this.tableCells(line);
    return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
  }

  /** Split a `| a | b |` row into trimmed cell strings. */
  private tableCells(line: string): string[] {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  /** Per-column alignment from the separator row (left/center/right or null). */
  private tableAligns(sep: string): (string | null)[] {
    return this.tableCells(sep).map((c) => {
      const l = c.startsWith(':');
      const r = c.endsWith(':');
      if (l && r) return 'center';
      if (r) return 'right';
      if (l) return 'left';
      return null;
    });
  }

  private renderTable(
    header: string[],
    aligns: (string | null)[],
    rows: string[][],
  ): string {
    const cell = (tag: 'th' | 'td', text: string, idx: number) => {
      const a = aligns[idx];
      const style = a ? ` style="text-align: ${a}"` : '';
      return `<${tag}${style}>${this.inline(text)}</${tag}>`;
    };
    const thead = `<thead><tr>${header
      .map((h, j) => cell('th', h, j))
      .join('')}</tr></thead>`;
    const tbody = `<tbody>${rows
      .map((r) => `<tr>${r.map((c, j) => cell('td', c, j)).join('')}</tr>`)
      .join('')}</tbody>`;
    return `<table class="ai-table">${thead}${tbody}</table>`;
  }

  /** Syntax-highlight a code body to hljs-classed HTML. Known language → that
   *  grammar; otherwise auto-detect (same behaviour as the note editor). Falls
   *  back to escaped plain text if highlighting is unavailable. */
  private highlight(lang: string, body: string): string {
    if (!body) return '';
    try {
      let tree: any;
      if (lang && lang !== 'plaintext') {
        try {
          tree = lowlight.highlight(lang, body);
        } catch {
          tree = lowlight.highlightAuto(body);
        }
      } else {
        tree = lowlight.highlightAuto(body);
      }
      return this.hastToHtml(tree?.children ?? []) || this.esc(body);
    } catch {
      return this.esc(body);
    }
  }

  /** Serialize a lowlight hast tree to HTML (only text + classed elements). */
  private hastToHtml(nodes: any[]): string {
    let out = '';
    for (const n of nodes) {
      if (n.type === 'text') {
        out += this.esc(n.value);
      } else if (n.type === 'element') {
        const cls = (n.properties?.className ?? []).join(' ');
        out += `<${n.tagName}${cls ? ` class="${cls}"` : ''}>`;
        out += this.hastToHtml(n.children ?? []);
        out += `</${n.tagName}>`;
      }
    }
    return out;
  }

  private esc(t: string): string {
    return t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
