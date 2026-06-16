import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Standard app swatch set — single source, reused by TiptapService. */
export const DEFAULT_PALETTE_COLORS: string[] = [
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

/**
 * Reusable color swatch palette. Every input has a default — only bind what
 * you need.
 *
 * Content:
 *  - colors       — swatch set (default: DEFAULT_PALETTE_COLORS)
 *  - swatchCount  — show at most N color swatches (default: all)
 *  - history      — prepend recently picked colors (default: off; size via historySize)
 *  - allowNone / allowCustom / showAlpha / customAlpha — feature toggles
 *
 * Layout & look:
 *  - variant      — 'panel' (scales with tile var --s) | 'dropdown' (fixed px)
 *  - rows         — arrange swatches in N grid rows (default: single wrapping row)
 *  - swatchSize   — explicit swatch size in px (overrides variant sizing)
 *  - minSwatchSize / maxSwatchSize — clamp the computed swatch size (px)
 *  - bgColor / panelBorderColor — container box styling (default: bare/transparent)
 *
 * Emits:
 *  - colorChange — every live change (swatch pick, custom-input drag, alpha drag)
 *  - colorCommit — final picks (swatch click, none, custom change committed);
 *                  parents use this to track their own "recent" colors.
 */
@Component({
  selector: 'app-color-palette',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './color-palette.component.html',
  styleUrl: './color-palette.component.scss',
})
export class ColorPaletteComponent {
  // ── Content ───────────────────────────────────────────────────────────────
  @Input() colors: string[] | null = null;
  @Input() swatchCount: number | null = null;
  @Input() history = false;
  @Input() historySize = 4;
  @Input() selected: string | null = null;
  @Input() allowNone = false;
  @Input() allowCustom = true;
  /** Show an alpha slider for the selected rgba color. */
  @Input() showAlpha = false;
  /** Alpha applied to custom-picked colors when no alpha can be derived. */
  @Input() customAlpha = 0.13;

  // ── Layout & look ────────────────────────────────────────────────────────
  @Input() variant: 'panel' | 'dropdown' = 'panel';
  @Input() rows: number | null = null;
  @Input() swatchSize: number | null = null;
  @Input() minSwatchSize: number | null = null;
  @Input() maxSwatchSize: number | null = null;
  @Input() bgColor: string | null = null;
  @Input() panelBorderColor: string | null = null;

  @Output() colorChange = new EventEmitter<string | null>();
  @Output() colorCommit = new EventEmitter<string | null>();

  private historyColors: string[] = [];

  @HostBinding('class.cp-dropdown') get isDropdown() {
    return this.variant === 'dropdown';
  }

  /** Boxed look when the container itself is styled. */
  @HostBinding('class.cp-boxed') get isBoxed() {
    return this.bgColor !== null || this.panelBorderColor !== null;
  }

  @HostBinding('style.background') get hostBg() { return this.bgColor; }
  @HostBinding('style.border') get hostBorder() {
    return this.panelBorderColor ? `1px solid ${this.panelBorderColor}` : null;
  }

  @HostBinding('style.--cp-base') get sizeOverride() {
    return this.swatchSize !== null ? `${this.swatchSize}px` : null;
  }
  @HostBinding('style.--cp-min') get sizeMin() {
    return this.minSwatchSize !== null ? `${this.minSwatchSize}px` : null;
  }
  @HostBinding('style.--cp-max') get sizeMax() {
    return this.maxSwatchSize !== null ? `${this.maxSwatchSize}px` : null;
  }

  /** Colors actually rendered: optional history first, then the base set. */
  get displayColors(): string[] {
    const base = this.colors ?? DEFAULT_PALETTE_COLORS;
    const merged = this.history
      ? [...this.historyColors, ...base.filter((c) => !this.historyColors.includes(c))]
      : base;
    return this.swatchCount !== null ? merged.slice(0, this.swatchCount) : merged;
  }

  /** repeat(N, ...) column count when a fixed row count is requested. */
  get gridColumns(): string | null {
    if (this.rows === null || this.rows < 1) return null;
    const total =
      this.displayColors.length + (this.allowNone ? 1 : 0) + (this.allowCustom ? 1 : 0);
    const cols = Math.max(1, Math.ceil(total / this.rows));
    return `repeat(${cols}, var(--cp-size))`;
  }

  pick(color: string | null) {
    this.remember(color);
    this.colorChange.emit(color);
    this.colorCommit.emit(color);
  }

  get isCustomActive(): boolean {
    return this.selected !== null && !this.displayColors.includes(this.selected);
  }

  get customHex(): string {
    const match = this.selected?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#ffffff';
    const toHex = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  get alpha(): number {
    const match = this.selected?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    return match ? parseFloat(match[1]) : this.customAlpha;
  }

  /** Opaque version of the selected color, for the alpha slider track. */
  get solidColor(): string {
    const match = this.selected?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : 'rgb(255,255,255)';
  }

  onCustomInput(event: Event) {
    this.colorChange.emit(this.customColorFrom(event));
  }

  onCustomChange(event: Event) {
    const color = this.customColorFrom(event);
    this.remember(color);
    this.colorChange.emit(color);
    this.colorCommit.emit(color);
  }

  onAlphaInput(event: Event) {
    if (this.selected === null) return;
    const alpha = parseFloat((event.target as HTMLInputElement).value);
    const match = this.selected.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return;
    this.colorChange.emit(`rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`);
  }

  private remember(color: string | null) {
    if (!this.history || color === null) return;
    this.historyColors = [
      color,
      ...this.historyColors.filter((c) => c !== color),
    ].slice(0, this.historySize);
  }

  private customColorFrom(event: Event): string {
    const hex = (event.target as HTMLInputElement).value;
    if (!this.showAlpha) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${this.alpha})`;
  }
}
