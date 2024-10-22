import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StorageService } from '../../service/storage.service';
import { CommonModule, DatePipe } from '@angular/common';
import { UserService } from '../../service/user.service';
import { CustomSnackbar } from '../../helpers/snackbar';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  providers: [DatePipe]
})
export class HomeComponent {


  constructor(private storageService: StorageService,private userService: UserService,private snackBar: CustomSnackbar){
    setInterval(() => this.dateTime = new Date())
  }
  private loading = true;
  user : any;
  location:any;
  dateTime!: Date;

  ngOnInit(): void {
    this.user = this.storageService.getUser();
    this.location = this.storageService.getLocation()
    if(this.location == null){
      this.userService.getClientIP().subscribe({
        next: (data) => {
          debugger;
          location = data;
          this.storageService.saveLocation(data);
          return this.userService.getWeather(data.latitude,data.longitude)
        },
        error:(error) =>{
          this.snackBar.info("Could not get user location")
        }
      })
    }
  }

}
