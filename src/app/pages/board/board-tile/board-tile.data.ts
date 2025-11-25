import { SafeHtml } from '@angular/platform-browser';
import { BoardConnector } from '../board-connector/board-connector';

export class BoardTile {
  x!: number;
  y!: number;
  width!: number;
  height!: number;
  tier!: number;
  label!: SafeHtml;
  topic: string = '';
  note: string = '';
  content: string = '';
  screenX!: number;
  screenY!: number;
  screenWidth!: number;
  screenHeight!: number;
  forceToRender: boolean = false;

  connectors: Set<BoardConnector> = new Set();
  constructor(
    realX: number,
    realY: number,
    realWidth: number,
    realHeight: number,
    connectors: Set<BoardConnector>,
    tier: number,
    label: string
  ) {
    this.x = realX;
    this.y = realY;
    this.width = realWidth;
    this.height = realHeight;
    this.tier = tier;
    this.label = label;
    this.screenX = realX;
    this.screenY = realY;
    this.screenWidth = realWidth;
    this.screenHeight = realHeight;
    this.connectors = connectors;
  }

  getCenterX() {
    return this.x + this.width / 2;
  }

  getCenterY() {
    return this.y + this.height / 2;
  }

  getCenterScreenX() {
    return this.screenX + this.screenWidth / 2;
  }

  getCenterScreenY() {
    return this.screenY + this.screenHeight / 2;
  }

  addConnector(item: BoardTile) {
    const connectorA = new BoardConnector(this, item);
    this.connectors.add(connectorA);
    const connectorB = new BoardConnector(item, this);
    item.connectors.add(connectorB);
  }

  updateSize(zoom: number) {
    this.screenWidth = this.width * zoom;
    this.screenHeight = this.height * zoom;
  }

  updatePosition(cameraX: number, cameraY: number, zoom: number) {
    this.screenX = (this.x - cameraX) * zoom;
    this.screenY = (this.y - cameraY) * zoom;
  }
}
