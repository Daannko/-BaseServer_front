import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { catchError, Observable, of, switchMap } from 'rxjs';
import { AuthService } from '../../service/auth.service';
import { Router, RouterModule } from '@angular/router';
import {MatSnackBar} from '@angular/material/snack-bar';
import { CustomSnackbar } from '../../helpers/snackbar';
import { error } from 'console';
import { UserService } from '../../service/user.service';

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

  constructor(private authService: AuthService,private snackBar: CustomSnackbar,private router:Router) { }

  // Call the login function when the user submits the form
  login() {
    this.authService.login(this.email,this.password).subscribe({
        next: (data) => {
          this.snackBar.success("Successfuly logged in")
          this.router.navigate(['/'])
        },
        error: (error) => console.log(error),
      }
    )
  }
}
