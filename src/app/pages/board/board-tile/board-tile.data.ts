import { SafeHtml } from '@angular/platform-browser';
import { BoardConnector } from '../board-connector/board-connector';
import { Topic } from '../models/topic.model';

export class BoardTile {
  id: string;
  x!: number;
  y!: number;
  width!: number;
  height!: number;
  tier!: number;
  topic: string = '';
  content: string = '';
  screenX!: number;
  screenY!: number;
  screenWidth!: number;
  screenHeight!: number;
  forceToRender: boolean = false;
  connectors: Set<BoardConnector> = new Set();
  label!: SafeHtml; //Connectors name

  constructor(
    id: string,
    realX: number,
    realY: number,
    realWidth: number,
    realHeight: number,
    connectors: Set<BoardConnector>,
    tier: number,
    label: string,
    content: string,
  ) {
    this.id = id;
    this.x = realX;
    this.y = realY;
    this.width = realWidth;
    this.height = realHeight;
    this.tier = tier;
    this.label = label;
    this.content = content;
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

  static fromTopic(topic: Topic): BoardTile {
    return new BoardTile(
      topic.id,
      topic.x,
      topic.y,
      topic.width,
      topic.height,
      new Set(),
      0,
      topic.title ?? '',
      topic.content ?? '',
    );
  }
}
