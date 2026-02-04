import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type ContextMenuItem = {
  id?: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
};

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.css'],
})
export class ContextMenuComponent {
  @Input() visible = false;
  @Input() x = 0;
  @Input() y = 0;
  @Input() items: ContextMenuItem[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() itemSelected = new EventEmitter<ContextMenuItem>();

  close() {
    this.closed.emit();
  }

  onItemClick(item: ContextMenuItem) {
    if (item.disabled) return;
    this.itemSelected.emit(item);
  }

  trackByLabel(_index: number, item: ContextMenuItem) {
    return item.id ?? item.label;
  }
}
