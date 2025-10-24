import { AfterViewInit, Component, ElementRef, HostListener, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StorageService } from '../../service/storage.service';
import { CommonModule, DatePipe } from '@angular/common';
import { UserService } from '../../service/user.service';
import { CustomSnackbar } from '../../helpers/snackbar';
import { Observable, switchMap, timer } from 'rxjs';
import { AuthService } from '../../service/auth.service';
import { NavbarComponent } from "../../helpers/navbar/navbar.component";


@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  providers: [DatePipe]
})
export class HomeComponent implements AfterViewInit,OnInit,OnDestroy {

  constructor(
    private storageService: StorageService,
    private userService: UserService,
    private snackBar: CustomSnackbar,
    private router: Router
  ){setInterval(() => this.dateTime = new Date())}

  scrollPosition: number = 0;
  user : any;
  location:any;
  dateTime!: Date;
  weather$!: Observable<any>;
  @ViewChild('clockElement') clockElement!: ElementRef; // Reference to the clock element
  observer!: IntersectionObserver;
  isClockVisible: boolean = false;
  gridItems: string[] = Array.from({ length: 60 }, (_, i) => `Item ${i + 1}`); // Example grid items


  ngOnInit(): void {
    this.user = this.storageService.getUser();
    if(!this.user){
      this.logout()
    }
    this.location = this.storageService.getLocation()
    if(this.location == null){
      this.userService.getClientIP().subscribe({
        next: (data) => {
          debugger;
          this.location = data;
          this.storageService.saveLocation(data);
          this.weather$ = this.userService.getWeather(this.location.latitude,this.location.longitude)
        },
        error:(error) =>{
          debugger;
          this.snackBar.info("Could not get user location")
        }
      })
    }
    else{
      this.weather$ = this.userService.getWeather(this.location.latitude,this.location.longitude)
    }
  }
  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
  }
  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect(); // Cleanup observer on destroy
    }
  }





  setupIntersectionObserver() {
    const options = {
      root: null, // Use the viewport as the container
      threshold: 0.1 // Trigger when at least 10% of the element is visible
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.isClockVisible = !entry.isIntersecting; // Update visibility state
      });
    }, options);
    this.observer.observe(this.clockElement.nativeElement);
  }


  logout(){
    this.router.navigate(['../logout'])
   }
}
