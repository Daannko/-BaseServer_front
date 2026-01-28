import type { JSONContent } from '@tiptap/core';
import { BoardConnector } from '../board-connector/board-connector';
import { Topic } from '../models/topic.model';
import { randomUUID } from 'crypto';

export class BoardTile {
  readonly id: string;
  private _x!: number;
  private _y!: number;
  private _width!: number;
  private _height!: number;
  private _name: JSONContent = BoardTile.emptyDoc();
  private _content: JSONContent = BoardTile.emptyDoc();
  private connectorsToBeAdded: Set<string> = new Set();
  private connectorsToBeRemoved: Set<string> = new Set();
  tier!: number;
  forceToRender: boolean = false;
  connectors: Set<BoardConnector> = new Set();
  positionUpdated = false;
  sizeUpdated = false;
  contentUpdated = false;
  nameUpdated = false;

  constructor(
    id: string,
    realX: number,
    realY: number,
    realWidth: number,
    realHeight: number,
    connectors: Set<BoardConnector>,
    tier: number,
    name: JSONContent,
    content: JSONContent,
  ) {
    this.id = id;
    this._x = realX;
    this._y = realY;
    this._width = realWidth;
    this._height = realHeight;
    this.tier = tier;
    this.name = name;
    this.content = content;
    this.connectors = connectors;
  }

  private static emptyDoc(): JSONContent {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  set x(x: number) {
    if (x === this._x) return;
    this.positionUpdated = true;
    this._x = x;
  }

  set y(y: number) {
    if (y === this._y) return;
    this.positionUpdated = true;
    this._y = y;
  }

  set width(width: number) {
    if (width === this._width) return;
    this.sizeUpdated = true;
    this._width = width;
  }

  set height(height: number) {
    if (height === this._height) return;
    this.sizeUpdated = true;
    this._height = height;
  }

  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }

  getCenterX() {
    return this.x + this._width / 2;
  }

  getCenterY() {
    return this.y + this.height / 2;
  }

  addConnectors(t: BoardTile) {
    const id = crypto.randomUUID();

    const connectorA = new BoardConnector(id, this, t);
    this.connectors.add(connectorA);
    this.handleAddConnectorHistory(id);

    const connectorB = new BoardConnector(id, t, this);
    t.connectors.add(connectorB);
    t.handleAddConnectorHistory(id);
  }

  get connectorsAdded(): string[] {
    return Array.from(this.connectorsToBeAdded);
  }

  get connectorsRemoved(): string[] {
    return Array.from(this.connectorsToBeRemoved);
  }

  clearConnectorChanges() {
    this.connectorsToBeAdded.clear();
    this.connectorsToBeRemoved.clear();
  }

  private handleAddConnectorHistory(id: string) {
    if (this.connectorsToBeRemoved.has(id)) {
      this.connectorsToBeRemoved.delete(id);
    }
    this.connectorsToBeAdded.add(id);
  }

  private handleRemoveConnectorHistory(id: string) {
    if (this.connectorsToBeAdded.has(id)) {
      this.connectorsToBeAdded.delete(id);
    }
    this.connectorsToBeRemoved.add(id);
  }

  removeConnector(c: BoardConnector) {
    if (!c?.id) return;
    this.removeConnectorById(c.id);
    this.handleRemoveConnectorHistory(c.id);
    c.itemB?.removeConnectorById(c.id);
    c.itemB?.handleRemoveConnectorHistory(c.id);
  }

  private removeConnectorById(connectorId: string) {
    for (const connector of this.connectors) {
      if (connector.id !== connectorId) continue;
      this.connectors.delete(connector);

      break;
    }
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
      topic.title ?? BoardTile.emptyDoc(),
      topic.content ?? BoardTile.emptyDoc(),
    );
  }

  set content(value: JSONContent) {
    if (value === this._content) return;
    this.contentUpdated = true;
    this._content = value;
  }

  set name(value: JSONContent) {
    if (value === this._name) return;
    this.nameUpdated = true;
    this._name = value;
  }

  get content() {
    return this._content;
  }

  get name() {
    return this._name;
  }

  updatePosition(x: number, y: number) {
    this.positionUpdated = true;
    this.x = x;
    this.y = y;
  }

  updateSize(width: number, height: number) {
    this.sizeUpdated = true;
    this.width = width;
    this.height = height;
  }

  toBeUpdated(): Boolean {
    return (
      this.contentUpdated ||
      this.nameUpdated ||
      this.positionUpdated ||
      this.sizeUpdated
    );
  }

  saved() {
    this.positionUpdated = false;
    this.sizeUpdated = false;
    this.contentUpdated = false;
    this.nameUpdated = false;
    this.connectorsToBeAdded.clear();
    this.connectorsToBeRemoved.clear();
  }
}
