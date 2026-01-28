import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { Router, ɵEmptyOutletComponent } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { NavbarService, NavbarState } from './navbar.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, ɵEmptyOutletComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  providers: [DatePipe],
})
export class NavbarComponent implements OnInit, OnDestroy {
  dateTime: Date = new Date();
  @Input() isClockVisible: boolean = false;
  @Input() isLogoutVisible: boolean = false;

  readonly state$: Observable<NavbarState>;

  private sub?: Subscription;

  private clockId?: number;

  constructor(
    private router: Router,
    private navbarService: NavbarService,
    private cdr: ChangeDetectorRef,
  ) {
    this.state$ = this.navbarService.state$;
  }

  ngOnInit(): void {
    this.clockId = window.setInterval(() => {
      this.dateTime = new Date();
      this.cdr.markForCheck();
    }, 1000);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.clockId != null) window.clearInterval(this.clockId);
  }

  logout() {
    this.router.navigate(['../logout']);
  }

  goHome() {
    this.router.navigate(['../']);
  }
}
