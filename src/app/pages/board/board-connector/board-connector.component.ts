import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardConnectorComponent implements AfterViewInit, OnDestroy {
  @Input() data!: BoardConnector;
  @Input() zoom: number = 1;
  @ViewChild('connector') connectorRef!: ElementRef<HTMLElement>;

  private cachedTitleSource: unknown = null;
  private cachedTitleHtml = '';

  constructor(private richText: RichTextService) {}

  updateSize() {
    const el = this.connectorRef.nativeElement;
    this.data.width = el.offsetWidth;
    this.data.height = el.offsetHeight;
    this.data.updatePosition();
  }

  ngAfterViewInit(): void {
    const el = this.connectorRef.nativeElement;
    this.data.domElement = el;
    this.data.updateLabel = () => {
      this.cachedTitleSource = null;
      el.innerHTML = this.richText.renderJsonToHtml(this.data.itemB.name);
    };
    const tileMin = Math.min(this.data.itemB.width, this.data.itemB.height);
    el.style.setProperty('--tile-min', tileMin + 'px');
    const sourceTileMin = Math.min(this.data.itemA.width, this.data.itemA.height);
    el.style.setProperty('--source-tile-min', sourceTileMin + 'px');
    this.updateSize(); // calls updatePosition which also sets transform/textAlign
    el.style.opacity = '1';
    this.data.opacity = 1;
  }

  ngOnDestroy(): void {
    this.data.domElement = null;
    this.data.updateLabel = null;
  }

  getTitleHtml(): string {
    const name = this.data.itemB.name;
    if (name !== this.cachedTitleSource) {
      this.cachedTitleSource = name;
      this.cachedTitleHtml = this.richText.renderJsonToSafeHtml(name) as string;
    }
    return this.cachedTitleHtml;
  }
}
