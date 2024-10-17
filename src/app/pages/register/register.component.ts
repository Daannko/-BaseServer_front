import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbar } from '../../helpers/snackbar';
import { timeout } from 'rxjs';

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

  constructor(private authService: AuthService,private router: Router,private snackBar: CustomSnackbar) { }

  register() {
    this.authService.register(this.email,this.password,this.name).subscribe({
      next:() => {
        this.snackBar.success("Success")
        setTimeout(()=> this.router.navigate(['/login']),2000)
      },
      error:(error) => this.snackBar.error(error)
    })
  }

}

