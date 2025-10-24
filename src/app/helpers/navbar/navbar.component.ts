import { CommonModule, DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  providers: [DatePipe]
})
export class NavbarComponent {


  constructor(    private router: Router) {
    setInterval(() => this.dateTime = new Date());
  }
  dateTime: Date = new Date();
  @Input() isClockVisible: boolean = false;
  @Input() isLogoutVisible: boolean = false;

  ngOnChanges() {
    console.log('isClockVisible:', this.isClockVisible);
  }

  logout(){
    this.router.navigate(['../logout'])
   }

  goHome(){
    this.router.navigate(['../'])
   } 
}
