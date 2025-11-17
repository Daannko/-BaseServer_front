import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { BoardConnector } from './board-connector';

@Component({
  selector: 'app-board-connector',
  standalone: true,
  imports: [],
  templateUrl: './board-connector.component.html',
  styleUrl: './board-connector.component.scss'
})
export class BoardConnectorComponent implements AfterViewInit {

  @Input() data!: BoardConnector;
  @Input() zoom: number = 1;
  @ViewChild('connector') connectorRef!: ElementRef;


  updateSize(){
    this.data.width = (this.connectorRef.nativeElement.offsetWidth)
    this.data.height = (this.connectorRef.nativeElement.offsetHeight)

  }

  ngAfterViewInit(): void {
    this.updateSize()
    this.data.opacity = 1
  }
}
