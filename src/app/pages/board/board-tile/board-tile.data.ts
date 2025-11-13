export class BoardTile {
  realX!: number;
  realY!: number;
  realWidth!: number;
  realHeight!: number;
  links!: Set<BoardTile>;
  tier!: number;
  label!: string;
  screenX!: number;
  screenY!: number;
  width!: number;
  height!: number;
  constructor(
    realX: number,
    realY: number,
    realWidth: number,
    realHeight: number,
    links: Set<BoardTile>,
    tier: number,
    label: string,
  ) {
    this.realX = realX;
    this.realY = realY;
    this.realWidth = realWidth;
    this.realHeight = realHeight;
    this.links = links == null ? new Set() : links;
    this.tier = tier;
    this.label = label;
    this.screenX = realX;
    this.screenY = realY;
    this.width = realWidth;
    this.height = realHeight;
  }

  addLink(item: BoardTile){
    this.links.add(item)
  }
}