import { BoardTile } from '../board-tile/board-tile.data';

export class BoardConnector {
  id!: string;
  x!: number;
  y!: number;
  width: number = 0;
  height: number = 0;
  itemA!: BoardTile;
  itemB!: BoardTile;
  angle!: number;
  sin!: number;
  cos!: number;
  opacity: number = 0;

  shiftX: number = 0;
  shiftY: number = 0;

  // Set by BoardConnectorComponent to receive direct DOM updates without Angular CD.
  domElement: HTMLElement | null = null;
  updateLabel: (() => void) | null = null;

  constructor(id: string, itemA: BoardTile, itemB: BoardTile) {
    this.id = id;
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
    const connectorShift = Math.max(15, Math.min(this.itemA.width, this.itemA.height) * 0.05);

    const tx =
      (this.itemA.width / 2 + connectorShift + this.width / 2) /
      Math.max(0.0001, Math.abs(this.cos));
    const ty =
      (this.itemA.height / 2 + connectorShift + this.height / 2) /
      Math.max(0.0001, Math.abs(this.sin));
    const r = Math.min(tx, ty);

    this.x = this.itemA.x + this.itemA.width / 2 + r * this.cos;
    this.y = this.itemA.y + this.itemA.height / 2 + r * this.sin;

    if (this.domElement) {
      this.domElement.style.left = this.x + 'px';
      this.domElement.style.top = this.y + 'px';
      this.domElement.style.setProperty('--tile-min', Math.min(this.itemB.width, this.itemB.height) + 'px');
      this.domElement.style.setProperty('--source-tile-min', Math.min(this.itemA.width, this.itemA.height) + 'px');

      this.domElement.style.transform = 'translate(-50%, -50%)';
    }
  }

  updateSize(zoom: number) {
    this.opacity = 2 * zoom - 1;
    if (this.domElement) {
      this.domElement.style.opacity = String(this.opacity);
    }
  }

  updateAngles() {
    const dx = this.itemA.getCenterX() - this.itemB.getCenterX();
    const dy = this.itemA.getCenterY() - this.itemB.getCenterY();
    this.angle = Math.atan2(-dy, -dx);
    this.cos = Math.cos(this.angle);
    this.sin = Math.sin(this.angle);
  }
}
