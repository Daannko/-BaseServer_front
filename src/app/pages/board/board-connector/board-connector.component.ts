import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';
import { RichTextService } from '../../../helpers/rich-text.service';
import { BoardConnector } from './board-connector';

@Component({
  selector: 'app-board-connector',
  standalone: true,
  imports: [],
  templateUrl: './board-connector.component.html',
  styleUrl: './board-connector.component.scss',
})
export class BoardConnectorComponent implements AfterViewInit {
  @Input() data!: BoardConnector;
  @Input() zoom: number = 1;
  @ViewChild('connector') connectorRef!: ElementRef;

  constructor(private richText: RichTextService) {}

  updateSize() {
    this.data.width = this.connectorRef.nativeElement.offsetWidth;
    this.data.height = this.connectorRef.nativeElement.offsetHeight;
    this.data.updatePosition();
  }

  ngAfterViewInit(): void {
    this.updateSize();
    this.data.opacity = 1;
  }

  getDisplayText(html: string): string {
    return html.replace(/<\/?p[^>]*>/g, '').trim();
  }

  getTitleHtml() {
    return this.richText.renderJsonToSafeHtml(this.data.itemB.name);
  }
}
