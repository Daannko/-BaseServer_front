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
    this.getData = this.storageService.isLoggedIn();
    this.authService.checkSession()
    .subscribe(data =>{
      console.log("Check Session go brrrrr: "+ data)
    })

  this.eventSub = this.eventService.on('logout', () => {
    this.logout();
  });

  }


  logout():void{
    localStorage.clear()
  }


}
