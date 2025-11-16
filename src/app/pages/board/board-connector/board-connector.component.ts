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


  updateSize(){
    this.data.width = (this.connectorRef.nativeElement.offsetWidth)
    this.data.height = (this.connectorRef.nativeElement.offsetHeight)
  }

  ngOnInit(){
      const connector = this.connectorRef.nativeElement;

      connector.addEventListener('contextmenu', (event: MouseEvent) => {
        console.log(this.data.itemB.label)
      })
  }

}
