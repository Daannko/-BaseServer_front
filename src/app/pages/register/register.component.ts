import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule,RouterModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  email: string = '';
  password: string = '';
  name:string = '';

  constructor(private authService: AuthService,private router: Router,private snackBar: MatSnackBar) { }

  register() {
    this.authService.register(this.email,this.password,this.name).subscribe(
      (response) => {
        this.snackBar.open('Success', 'Close', {
          duration: 2000, // Set the duration in milliseconds
          horizontalPosition: 'start',
          verticalPosition: 'bottom',
          panelClass: ['snackbar-success']
        });
        setTimeout(() => this.router.navigate(["/login"]), 2000)
      },
      (error) => {
        console.log(error)
      }
    );
  }

}

