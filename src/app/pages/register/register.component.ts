import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { RouterModule } from '@angular/router';

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

  constructor(private authService: AuthService) { }

  register() {
    this.authService.register(this.email,this.password,this.name).subscribe(
      response => {
        console.log(response);
      },
    );
  }

}

