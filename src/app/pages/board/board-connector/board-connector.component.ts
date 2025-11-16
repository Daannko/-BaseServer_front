import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { BoardConnector } from './board-connector';

@Component({
  selector: 'app-board-connector',
  standalone: true,
  imports: [],
  templateUrl: './board-connector.component.html',
  styleUrl: './board-connector.component.scss'
})
export class BoardConnectorComponent {
  @Input() data!: BoardConnector;
  @ViewChild('connector') connectorRef!: ElementRef;


  updateShift(){
    this.data.width = (this.connectorRef.nativeElement.offsetWidth / 2)
    this.data.height = (this.connectorRef.nativeElement.offsetHeight / 2)
    this.data.setLocation(this.data.itemA,this.data.itemB)

  }

}
