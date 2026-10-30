import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { NgIf } from '@angular/common';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
selector: 'app-page-tile',
standalone: true,
template: `
    <button type="button" class="tile" [class.featured]="featured" [disabled]="!url" (click)="navigate()">
      <span class="tile-top">
        <span class="icon"><app-svg-icon [icon]="icon"></app-svg-icon></span>
        <span *ngIf="url" class="knob"><app-svg-icon icon="general/arrow-up-right"></app-svg-icon></span>
      </span>
      <span class="content">
        <span class="name">{{name}}</span>
        <span class="description">{{description}}</span>
        <span *ngIf="!url" class="no-link">No link yet</span>
      </span>
    </button>
  `,
styleUrls: ['./page.tile.component.scss'],
imports: [NgIf, SvgIconComponent]
}) export class PageTileComponent {
  @Input() name: string = ''
  @Input() description: string = ''
  @Input() icon: string = ''
  @Input() url: string = ''
  @Input() featured: boolean = false

  constructor(private router: Router) {} // Inject Router

 navigate() {
    if (this.url.startsWith('http')) {
      window.open(this.url, '_blank');
    } else {
      this.router.navigate([this.url]);
    }
  }
}
