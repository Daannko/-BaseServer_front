import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { NgStyle } from '@angular/common';

@Component({
selector: 'app-page-tile',
standalone: true,
template: `
    <div class="tile" (click)="navigate()" [ngStyle]="{ 'background-image': 'url(' + icon + ')'}" tabindex="0">
      <div class="icon">
        <i [class]="icon"></i>
      </div>
 <div class="content">
    <h3>
      <div class="text-wrapper">{{name}}</div>
    </h3>
    <p class="text-wrapper">{{description}}</p>
    
  </div>
    </div>
  `,
styleUrls: ['./page.tile.component.scss'],
imports: [NgStyle]
}) export class PageTileComponent {
  @Input() name: string = ''
  @Input() description: string = ''
  @Input() icon: string = ''
  @Input() url: string = ''

  constructor(private router: Router) {} // Inject Router

 navigate() {
    if (this.url.startsWith('http')) {
      window.open(this.url, '_blank');
    } else {
      this.router.navigate([this.url]);
    }
  }
}