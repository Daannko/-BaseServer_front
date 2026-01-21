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

  /** Emits when user commits a value (selects option / presses Enter / blurs). */
  @Output() commit = new EventEmitter<string>();

  /** Emits on every input change (useful if the parent wants to mirror state). */
  @Output() queryChange = new EventEmitter<string>();

  isOpen = false;
  query = '';
  filtered: QuerySelectOption[] = [];

  private suppressBlurCommit = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnInit() {
    this.filtered = this.options ?? [];
  }

  ngOnChanges() {
    this.filter();
  }

  open() {
    this.isOpen = true;
    this.filter();
  }

  close() {
    this.isOpen = false;
  }

  onInput(value: string) {
    this.query = value;
    this.queryChange.emit(value);
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
    // If an option click is in progress (mousedown), let that win.
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

  private filter() {
    const options = this.options ?? [];
    const q = (this.query || '').trim().toLowerCase();
    if (!q) {
      this.filtered = options;
      return;
    }

    this.filtered = options.filter((opt) => {
      const { label, value } = this.readOption(opt);
      return label.toLowerCase().includes(q) || value.toLowerCase().includes(q);
    });
    if (this.filtered.length == 0) {
      this.isOpen = false;
    } else this.isOpen = true;
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
