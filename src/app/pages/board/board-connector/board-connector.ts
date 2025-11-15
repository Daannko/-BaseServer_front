import { BoardTile } from "../board-tile/board-tile.data";

export class BoardConnector{

    x!: number;
    y!: number;
    width!: number;
    height!: number;
    label!: string;tier!: number;
    screenX!: number;
    screenY!: number;
    screenWidth!: number;
    screenHeight!: number;
    itemA!: BoardTile;
    itemB!: BoardTile;


    constructor(itemA:BoardTile,itemB:BoardTile){
        let pos = this.getLinkConnectorPosition(itemA,itemB)
        this.x = pos.x;
        this.y= pos.y;
        this.width = 50;
        this.height = 50;
        this.itemA = itemA;
        this.itemB = itemB;
    }

    getCenterX(){
     return this.x + this.width / 2  
    }

    getCenterY(){
     return this.y + this.height / 2 
    }

    getLinkConnectorPosition(itemA: BoardTile,itemB: BoardTile){
        var dx = itemA.getCenterX() - itemB.getCenterX()
        var dy = itemA.getCenterY() - itemB.getCenterY()
        var angle = Math.atan2(-dy,-dx)

        const r = 200
        const x = (itemA.x + (itemA.width / 2)) + r * Math.cos(angle) 
        const y = (itemA.y + (itemA.height / 2)) + r * Math.sin(angle)

        return {x,y}
  }

}