import { connect } from 'http2';
import { BoardTile } from '../board-tile/board-tile.data';
import { Topic } from '../models/topic.model';

export class BoardConnector {
  x!: number;
  y!: number;
  width: number = 0;
  height: number = 0;
  screenWidth!: number;
  screenHeight!: number;
  itemA!: BoardTile;
  itemB!: BoardTile;
  angle!: number;
  sin!: number;
  cos!: number;
  opacity: number = 0;

  shiftX: number = 0;
  shiftY: number = 0;

  constructor(itemA: BoardTile, itemB: BoardTile) {
    this.itemA = itemA;
    this.itemB = itemB;
    this.updateAngles();
    this.updatePosition();
  }

  getCenterX() {
    return this.x;
  }

  getCenterY() {
    return this.y;
  }

  updatePosition() {
    const connectorShift = 20;

    const tx =
      (this.itemA.width / 2 + connectorShift + this.width / 2) /
      Math.max(0.0001, Math.abs(this.cos));
    const ty =
      (this.itemA.height / 2 + connectorShift + this.height / 2) /
      Math.max(0.0001, Math.abs(this.sin));
    const r = Math.min(tx, ty);

    var x = this.itemA.screenX + this.itemA.screenWidth / 2 + r * this.cos;
    var y = this.itemA.screenY + this.itemA.screenHeight / 2 + r * this.sin;

    this.x = x;
    this.y = y;
  }

  updateSize(zoom: number) {
    this.opacity = 2 * zoom - 1;
  }

  updateAngles() {
    var dx = this.itemA.getCenterX() - this.itemB.getCenterX();
    var dy = this.itemA.getCenterY() - this.itemB.getCenterY();
    this.angle = Math.atan2(-dy, -dx);
    this.cos = Math.cos(this.angle);
    this.sin = Math.sin(this.angle);
  }
}
