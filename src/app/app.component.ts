import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './service/auth.service';
import { StorageService } from './service/storage.service';
import { error } from 'console';
import { switchMap,of, catchError, tap, Subscription } from 'rxjs';
import { UserService } from './service/user.service';
import e from 'express';
import { EventService } from './service/event.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'BaseServer-app';


  constructor(
    private authService:AuthService,
    private storageService:StorageService,
    private userService:UserService,
    private eventService:EventService
  ){}

  private isLoggedIn = false;
  private loading = true;
  private getData = false;
  private value = 0;
  eventSub?: Subscription;

  ngOnInit(): void {
    console.log(this.value++)
    this.getData = this.storageService.isLoggedIn();
    this.authService.refresh().pipe(
      switchMap((res:any) => this.userService.getUserData()),
      catchError(errorForFirstOrSecondCall => {
        this.logout()
        console.error('An error occurred: ', errorForFirstOrSecondCall);
        throw new Error('Error: ' + errorForFirstOrSecondCall.message);
      }))
      .subscribe(data =>
         this.storageService.saveUser(data)
      )

      this.eventSub = this.eventService.on('logout', () => {
        this.logout();
      });

  }


  logout():void{
    localStorage.clear()
  }


}
