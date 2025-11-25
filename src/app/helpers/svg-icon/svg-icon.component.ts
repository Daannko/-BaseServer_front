import { Component, HostBinding, Input } from '@angular/core';


@Component({
  selector: 'app-svg-icon',
  standalone: true,
  imports: [],
  templateUrl: './svg-icon.component.html',
  styleUrl: './svg-icon.component.scss'
})
export class SvgIconComponent {
    @HostBinding('style.-webkit-mask-image')
    public _path!: string;

  @Input()
  public set icon(icon: string){
    const iconMap: { [key: string]: string } = {
      'editor-bold': 'editor-bold.svg',
      'editor-italic': 'editor-italic.svg',
      'editor-underline': 'editor-underline.svg',
      'editor-strikethrough': 'editor-strikethrough.svg',
      'editor-code': 'editor-code.svg',
      'editor-quote': 'editor-quote.svg',
      'editor-ul': 'editor-ul.svg',
      'editor-ol': 'editor-ol.svg',
      'editor-table': 'editor-table.svg',
      'editor-alignleft': 'editor-alignleft.svg',
      'editor-aligncenter': 'editor-aligncenter.svg',
      'editor-alignright': 'editor-alignright.svg',
      'editor-justify': 'editor-justify.svg',
      'editor-indent': 'editor-indent.svg',
      'editor-outdent': 'editor-outdent.svg',
      'editor-textcolor': 'editor-textcolor.svg',
      'editor-break': 'editor-break.svg',
      'editor-paste-text': 'editor-paste-text.svg',
      'editor-paste-word': 'editor-paste-word.svg',
    };
    
    const filename = iconMap[icon] || `${icon}.svg`;
    this._path = `url(assets/board_icons/${filename})`;
  }

}
