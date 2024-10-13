import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../service/auth.service';
import { RouterModule } from '@angular/router';
import {MatSnackBar} from '@angular/material/snack-bar';
import { CustomSnackbar } from '../../helpers/snackbar';
import { error } from 'console';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule,RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {

  email: string = '';
  password: string = '';

  constructor(private authService: AuthService,private snackBar: CustomSnackbar) { }

  // Call the login function when the user submits the form
  login() {
    this.authService.login(this.email,this.password).subscribe({
      next: (res:any) => {
        this.snackBar.success("Success");
      },
      error: (error:any) => {
        this.snackBar.error("Failed to login");
      }
    }
    );
  }


}
