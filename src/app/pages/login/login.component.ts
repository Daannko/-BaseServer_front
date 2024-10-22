import { Component } from '@angular/core';
import { FormBuilder,ReactiveFormsModule, FormControl, FormGroup, FormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { Router, RouterModule } from '@angular/router';
import { CustomSnackbar } from '../../helpers/snackbar';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterModule,        FormsModule,
    ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {

  email: string = '';
  password: string = '';
  loginForm!: FormGroup;

  constructor(
    private authService: AuthService,
    private snackBar: CustomSnackbar,
    private router:Router) { }

  ngOnInit(): void {
    this.loginForm = new FormGroup({
      email: new FormControl('',[Validators.required,Validators.email]),
      password: new FormControl('',[Validators.required])
    })
  }

  validate():boolean{
    Object.keys(this.loginForm.controls).reverse().forEach(key => {
      const controlErrors = this.loginForm.get(key)?.errors
      if (controlErrors != null){
        Object.keys(controlErrors).forEach(keyError => {
          if(keyError === 'required'){
            var name = key.charAt(0).toLocaleUpperCase() + key.slice(1)
            this.snackBar.error(`${name} is required`)
            return false;
          } else if(keyError === 'email'){
            this.snackBar.error(`Email have to ba an actuall email :)`)
            return false;
          }
          return false;
        })
      }
    });
    return this.loginForm.valid;
  }


  login() {
    if(!this.validate()){
      return
    }
    this.authService.login(this.email,this.password).subscribe({
        next: (data) => {
          this.snackBar.success("Successfuly logged in")
          this.router.navigate(['/'])
        },
        error: (error) => {
          console.log(error)
          this.snackBar.error(error.error.message)
        },
      }
    )
  }
}
