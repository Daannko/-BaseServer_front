import { Component, HostBinding, Input } from '@angular/core';

@Component({
  selector: 'app-svg-icon',
  standalone: true,
  imports: [],
  templateUrl: './svg-icon.component.html',
  styleUrl: './svg-icon.component.scss',
})
export class SvgIconComponent {
  @HostBinding('style.-webkit-mask-image')
  public _path!: string;

  @Input()
  public set icon(icon: string) {
    const iconMap: { [key: string]: string } = {
      'editor-bold': 'board_icons/editor-bold.svg',
      'editor-italic': 'board_icons/editor-italic.svg',
      'editor-underline': 'board_icons/editor-underline.svg',
      'editor-strikethrough': 'board_icons/editor-strikethrough.svg',
      'editor-code': 'board_icons/editor-code.svg',
      'editor-code-duplicate': 'board_icons/editor-code-duplicate.svg',
      'editor-quote': 'board_icons/editor-quote.svg',
      'editor-ul': 'board_icons/editor-ul.svg',
      'editor-ol': 'board_icons/editor-ol.svg',
      'editor-table': 'board_icons/editor-table.svg',
      'editor-alignleft': 'board_icons/editor-alignleft.svg',
      'editor-aligncenter': 'board_icons/editor-aligncenter.svg',
      'editor-alignright': 'board_icons/editor-alignright.svg',
      'editor-justify': 'board_icons/editor-justify.svg',
      'editor-indent': 'board_icons/editor-indent.svg',
      'editor-outdent': 'board_icons/editor-outdent.svg',
      'editor-textcolor': 'board_icons/editor-textcolor.svg',
      'editor-break': 'board_icons/editor-break.svg',
      'editor-paste-text': 'board_icons/editor-paste-text.svg',
      'editor-paste-word': 'board_icons/editor-paste-word.svg',
      // Table manipulation icons
      'table-add-column-before': 'board_icons/table/table-insert-left.svg',
      'table-add-column-after': 'board_icons/table/table-insert-right.svg',
      'table-delete-column': 'board_icons/table/table-column-delete.svg',
      'table-add-row-before': 'board_icons/table/table-insert-up.svg',
      'table-add-row-after': 'board_icons/table/table-insert-down.svg',
      'table-delete-row': 'board_icons/table/table-row-delete.svg',
      'table-delete': 'board_icons/table/table-delete.svg',
      'table-merge-cells': 'board_icons/table/table-cells-merge.svg',
      'table-split-cell': 'board_icons/table/table-cells-split.svg',
      'table-freeze-cell': 'board_icons/table/table-freeze-cell.svg',
      'table-freeze-column': 'board_icons/table/table-freeze-column.svg',
      'table-freeze-row': 'board_icons/table/table-freeze-row.svg',
      'table-move-left': 'board_icons/table/table-move-left.svg',
      'table-move-right': 'board_icons/table/table-move-right.svg',
      'close-x': 'general/close-x.svg',
      'chevron-left': 'general/chevron-left.svg',
      table: 'board_icons/table/table.svg',
    };

    const filename = iconMap[icon] || `${icon}.svg`;
    this._path = `url(assets/${filename})`;
  }
}
