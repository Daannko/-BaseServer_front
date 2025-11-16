import { connect } from "http2";
import { BoardTile } from "../board-tile/board-tile.data";

export class BoardConnector{

    x!: number;
    y!: number;
    width: number = 50;
    height: number = 50;
    label!: string;
    tier!: number;
    shiftX: number = 0;
    shiftY: number = 0;
    screenX!: number;
    screenY!: number;
    screenWidth!: number;
    screenHeight!: number;
    itemA!: BoardTile;
    itemB!: BoardTile;
    angle!: number;
    sin!: number;
    cos!: number
    zoom!: number;


    constructor(itemA:BoardTile,itemB:BoardTile){
        this.itemA = itemA;
        this.itemB = itemB;
        this.setLocation(itemA,itemB)
        this.label

    }

    getCenterX(){
     return this.x  
    }

    getCenterY(){
     return this.y 
    }

    setLocation(itemA: BoardTile,itemB: BoardTile){
        var dx = itemA.getCenterX() - itemB.getCenterX()
        var dy = itemA.getCenterY() - itemB.getCenterY()
        var angle = Math.atan2(-dy,-dx)
        var cos = Math.cos(angle)
        var sin = Math.sin(angle)

        // if(itemA.label === 'Item A'){
        //     console.log(itemB.label + ": " + angle * 180 / Math.PI)
        //     console.log(cos, + " " + sin)
        // }

        var connectorShift = 10

        const tx = ((itemA.width / 2) + connectorShift + this.width) / Math.abs(cos) 
        const ty = ((itemA.height / 2) + connectorShift + this.height)  / Math.abs(sin) 
        const r = Math.min(tx,ty)

        const x = (itemA.x ) + r * cos
        const y = (itemA.y) + r * sin

        this.x = x 
        this.y = y
        this.angle = angle
        this.cos = cos
        this.sin = sin
  }

  calculateScreenPositon(cameraX: number,cameraY: number,zoom: number){
    this.screenX = (this.x - cameraX) * zoom;
    this.screenY = (this.y - cameraY) * zoom;
  }

}