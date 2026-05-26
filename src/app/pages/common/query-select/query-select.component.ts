import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type QuerySelectOption = Record<string, any> | string;

@Component({
  selector: 'app-query-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-select.component.html',
  styleUrl: './query-select.component.scss',
})
export class QuerySelectComponent {
  @Input() options: QuerySelectOption[] = [];
  @Input() placeholder = '';
  @Input() title = '';

  /** When options are objects, use these keys to read label/value */
  @Input() labelKey = 'label';
  @Input() valueKey = 'value';

  /** Allow committing arbitrary typed text (not just from options). */
  @Input() allowCustom = true;
  @Input() clearOnClick = true;

  /** Restrict input to numeric characters only. */
  @Input() numbersOnly = false;

  /** When true, the "rest" (non-matching) section is hidden while the user is typing. */
  @Input() hideRestOnQuery = false;

  /** When true, always show the full options list. If query is set, prepend it as the first option. */
  @Input() alwaysShowAll = false;

  /** Visual variant — drives CSS class on the host wrapper. */
  @Input() variant: 'text' | 'number' = 'text';

  /** Sets the displayed value from outside (e.g. current editor state). Ignored while the dropdown is open. */
  @Input() set displayValue(v: string) {
    if (!this.isOpen) {
      this.query = v ?? '';
    }
  }

  /** Emits when user commits a value (selects option / presses Enter / blurs). */
  @Output() commit = new EventEmitter<string>();

  /** Emits on every input change (useful if the parent wants to mirror state). */
  @Output() queryChange = new EventEmitter<string>();

  isOpen = false;
  query = '';
  filteredMatches: QuerySelectOption[] = [];
  filteredRest: QuerySelectOption[] = [];

  get showDivider() {
    return this.filteredMatches.length > 0 && this.filteredRest.length > 0;
  }

  private suppressBlurCommit = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnInit() {
    this.filteredRest = this.options ?? [];
  }

  ngOnChanges() {
    this.filter();
  }

  open() {
    this.isOpen = true;
    this.showAllSorted();
  }

  close() {
    this.isOpen = false;
  }

  onInput(value: string) {
    const clean = this.numbersOnly ? value.replace(/\D/g, '') : value;
    this.query = clean;
    this.queryChange.emit(clean);
    this.isOpen = true;
    this.filter();
  }

  onEnter() {
    if (!this.allowCustom) return;
    const v = (this.query || '').trim();
    if (!v) return;
    this.commit.emit(v);
    this.close();
  }

  onBlur() {
    if (this.suppressBlurCommit) {
      this.suppressBlurCommit = false;
      return;
    }

    if (!this.allowCustom) {
      this.close();
      return;
    }

    const v = (this.query || '').trim();
    if (v) this.commit.emit(v);
    this.close();
  }

  onOptionMouseDown(option: QuerySelectOption) {
    this.suppressBlurCommit = true;
    const { label, value } = this.readOption(option);
    this.query = label;
    this.queryChange.emit(this.query);
    this.commit.emit(value);
    this.close();
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.numbersOnly) return;
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];
    if (allowed.includes(event.key)) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  trackByIndex(index: number) {
    return index;
  }

  readOption(option: QuerySelectOption): { label: string; value: string } {
    if (typeof option === 'string') {
      return { label: option, value: option };
    }

    const rawLabel = (option as any)?.[this.labelKey];
    const rawValue = (option as any)?.[this.valueKey];
    const label = String(rawLabel ?? rawValue ?? '');
    const value = String(rawValue ?? rawLabel ?? '');
    return { label, value };
  }

  isSelected(option: QuerySelectOption): boolean {
    if (!this.query) return false;
    const { label } = this.readOption(option);
    return label.toLowerCase() === this.query.toLowerCase();
  }

  private showAllSorted() {
    if (this.alwaysShowAll) {
      this.filter();
      return;
    }
    const options = this.options ?? [];
    const sorted = [...options];
    const q = (this.query || '').trim().toLowerCase();
    if (q) {
      const idx = sorted.findIndex((opt) => {
        const { label } = this.readOption(opt);
        return label.toLowerCase() === q;
      });
      if (idx > 0) {
        const [selected] = sorted.splice(idx, 1);
        sorted.unshift(selected);
      }
    }
    this.filteredMatches = [];
    this.filteredRest = sorted;
  }

  private filter() {
    const options = this.options ?? [];
    const q = (this.query || '').trim().toLowerCase();

    if (this.alwaysShowAll) {
      if (!q) {
        this.filteredMatches = [];
        this.filteredRest = [...options];
      } else {
        // Prepend typed value as first option; exclude exact preset match to avoid duplicate
        const rest = options.filter((opt) => {
          const { label } = this.readOption(opt);
          return label.toLowerCase() !== q;
        });
        this.filteredMatches = [this.query];
        this.filteredRest = rest;
      }
      return;
    }

    if (!q) {
      this.filteredMatches = [];
      this.filteredRest = [...options];
      return;
    }

    const matches = options.filter((opt) => {
      const { label, value } = this.readOption(opt);
      return label.toLowerCase().includes(q) || value.toLowerCase().includes(q);
    });

    const matchSet = new Set(matches);
    const rest = options.filter((opt) => !matchSet.has(opt));

    this.filteredMatches = matches.slice(0, 6);
    this.filteredRest = this.hideRestOnQuery ? [] : rest;

    if (matches.length === 0 && !this.allowCustom) {
      this.isOpen = false;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent) {
    const el = this.host.nativeElement;
    if (!el.contains(ev.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }
}
