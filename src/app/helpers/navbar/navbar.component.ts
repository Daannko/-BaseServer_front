import { CommonModule, DatePipe } from '@angular/common';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarService, NavbarState } from '../../service/navbar.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  providers: [DatePipe]
})
export class NavbarComponent {
  dateTime: Date = new Date();
  @Input() isClockVisible: boolean = false;
  @Input() isLogoutVisible: boolean = false;

  state: NavbarState = {};
  private sub?: Subscription;

  constructor(private router: Router, private navbarService: NavbarService) {
    setInterval(() => this.dateTime = new Date());
  }

  ngOnInit(): void {
    this.sub = this.navbarService.state$.subscribe(s => this.state = s || {});
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  ngOnChanges() {
    // kept for debug
  }

  logout(){
    this.router.navigate(['../logout'])
  }

  goHome(){
    this.router.navigate(['../'])
  }
}
