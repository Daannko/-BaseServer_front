import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StorageService } from '../../service/storage.service';
import { CommonModule, DatePipe } from '@angular/common';
import { UserService } from '../../service/user.service';
import { CustomSnackbar } from '../../helpers/snackbar';
import { Observable, switchMap, timer } from 'rxjs';
import { AuthService } from '../../service/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  providers: [DatePipe]
})
export class HomeComponent {


  constructor(
    private storageService: StorageService,
    private userService: UserService,
    private snackBar: CustomSnackbar,
    private router: Router
  ){
    setInterval(() => this.dateTime = new Date())
  }
  private loading = true;
  user : any;
  location:any;
  dateTime!: Date;
  weather$!: Observable<any>;

  ngOnInit(): void {
    this.user = this.storageService.getUser();

    if(!this.user){
      this.logout()
    }

    this.location = this.storageService.getLocation()
    if(this.location == null){
      this.userService.getClientIP().subscribe({
        next: (data) => {
          this.location = data;
          this.storageService.saveLocation(data);

        },
        error:(error) =>{
          this.snackBar.info("Could not get user location")
        }
      })
    }
    else{
      this.weather$ = this.userService.getWeather(this.location.latitude,this.location.longitude)
    }
  }

  logout(){
   this.router.navigate(['../logout'])
  }

}
