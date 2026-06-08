import type { JSONContent } from '@tiptap/core';
import { docFromText } from '../../../helpers/rich-text.util';

export class BoardItem {
  readonly id: string;
  serverId?: string;
  private _x!: number;
  private _y!: number;
  private _width!: number;
  private _height!: number;
  private _name: JSONContent = docFromText('Name');
  private _content: JSONContent = docFromText('Content');
  zIndex: number = 1;
  forceToRender: boolean = false;
  inView = false;
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
    name: JSONContent,
    content: JSONContent,
  ) {
    this.id = id;
    this._x = realX;
    this._y = realY;
    this._width = realWidth;
    this._height = realHeight;
    this.name = name;
    this.content = content;
  }

  set x(x: number) { if (x === this._x) return; this.positionUpdated = true; this._x = x; }
  set y(y: number) { if (y === this._y) return; this.positionUpdated = true; this._y = y; }
  set width(w: number) { if (w === this._width) return; this.sizeUpdated = true; this._width = w; }
  set height(h: number) { if (h === this._height) return; this.sizeUpdated = true; this._height = h; }
  get x() { return this._x; }
  get y() { return this._y; }
  get width() { return this._width; }
  get height() { return this._height; }

  getCenterX() { return this.x + this._width / 2; }
  getCenterY() { return this.y + this.height / 2; }

  set content(value: JSONContent) { if (value === this._content) return; this.contentUpdated = true; this._content = value; }
  set name(value: JSONContent) { if (value === this._name) return; this.nameUpdated = true; this._name = value; }
  get content() { return this._content; }
  get name() { return this._name; }

  updatePosition(x: number, y: number) { this.positionUpdated = true; this.x = x; this.y = y; }
  updateSize(width: number, height: number) { this.sizeUpdated = true; this.width = width; this.height = height; }

  toBeUpdated(): boolean {
    return this.contentUpdated || this.nameUpdated || this.positionUpdated || this.sizeUpdated;
  }

  saved() {
    this.positionUpdated = false;
    this.sizeUpdated = false;
    this.contentUpdated = false;
    this.nameUpdated = false;
  }
}
