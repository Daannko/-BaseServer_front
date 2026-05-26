import type { JSONContent } from '@tiptap/core';
import { BoardConnector } from '../board-connector/board-connector';
import { Topic } from '../models/topic.model';
import {
  docFromText,
  docFromTextWithFontSize,
  emptyDoc,
  getDoc,
} from '../../../helpers/rich-text.util';

export class BoardTile {
  readonly id: string;
  /** Backend topic id (undefined for not-yet-created topics). */
  serverId?: string;
  private _x!: number;
  private _y!: number;
  private _width!: number;
  private _height!: number;
  private _name: JSONContent = docFromText('Name');
  private _content: JSONContent = docFromText('Content');
  private relatedTopicsToBeAdded: Set<string> = new Set();
  private relatedTopicsToBeRemoved: Set<string> = new Set();
  tier!: number;
  forceToRender: boolean = false;
  inView = false;
  connectors: Set<BoardConnector> = new Set();
  inboundConnectors: Set<BoardConnector> = new Set();
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

  static newTile(x: number, y: number, width: number, height: number) {
    const nameFont = width / 18;
    const contentFont = width / 15;
    return new BoardTile(
      globalThis.crypto.randomUUID(),
      x,
      y,
      width,
      height,
      new Set(),
      0,
      docFromTextWithFontSize('Name', nameFont),
      docFromTextWithFontSize('Content', contentFont),
    );
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
    const id = globalThis.crypto.randomUUID();

    const connectorA = new BoardConnector(id, this, t);
    this.connectors.add(connectorA);
    t.inboundConnectors.add(connectorA);
    this.handleAddRelatedTopicHistory(t.id);

    const connectorB = new BoardConnector(id, t, this);
    t.connectors.add(connectorB);
    this.inboundConnectors.add(connectorB);
    t.handleAddRelatedTopicHistory(this.id);
  }

  get connectorsAdded(): string[] {
    return Array.from(this.relatedTopicsToBeAdded);
  }

  get connectorsRemoved(): string[] {
    return Array.from(this.relatedTopicsToBeRemoved);
  }

  clearConnectorChanges() {
    this.relatedTopicsToBeAdded.clear();
    this.relatedTopicsToBeRemoved.clear();
  }

  private handleAddRelatedTopicHistory(topicId: string) {
    if (this.relatedTopicsToBeRemoved.has(topicId)) {
      this.relatedTopicsToBeRemoved.delete(topicId);
    }
    this.relatedTopicsToBeAdded.add(topicId);
  }

  private handleRemoveRelatedTopicHistory(topicId: string) {
    if (this.relatedTopicsToBeAdded.has(topicId)) {
      this.relatedTopicsToBeAdded.delete(topicId);
    }
    this.relatedTopicsToBeRemoved.add(topicId);
  }

  removeConnector(c: BoardConnector) {
    if (!c?.id) return;

    const otherTile = c.itemB;

    this.removeConnectorById(c.id);
    otherTile?.inboundConnectors.delete(c);
    if (otherTile?.id) this.handleRemoveRelatedTopicHistory(otherTile.id);

    const counterpart = otherTile
      ? [...otherTile.connectors].find(x => x.id === c.id)
      : undefined;
    otherTile?.removeConnectorById(c.id);
    if (counterpart) this.inboundConnectors.delete(counterpart);
    if (c.itemA?.id) otherTile?.handleRemoveRelatedTopicHistory(c.itemA.id);
  }

  private removeConnectorById(connectorId: string) {
    for (const connector of this.connectors) {
      if (connector.id !== connectorId) continue;
      this.connectors.delete(connector);

      break;
    }
  }

  static fromTopic(topic: Topic): BoardTile {
    const tile = new BoardTile(
      topic.id,
      topic.x,
      topic.y,
      topic.width,
      topic.height,
      new Set(),
      0,
      topic.title ?? emptyDoc(),
      topic.content ?? emptyDoc(),
    );
    tile.serverId = topic.id;
    return tile;
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
    for (const conn of this.inboundConnectors) {
      conn.updateLabel?.();
    }
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
    this.relatedTopicsToBeAdded.clear();
    this.relatedTopicsToBeRemoved.clear();
  }
}
