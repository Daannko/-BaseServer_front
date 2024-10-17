import { Component } from '@angular/core';
import { FormBuilder,ReactiveFormsModule, FormControl, FormGroup, FormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { Router, RouterModule } from '@angular/router';
import { CustomSnackbar } from '../../helpers/snackbar';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterModule,        FormsModule,
    ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  email: string = '';
  password: string = '';
  name:string = '';
  registrationForm!: FormGroup;

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: CustomSnackbar,
  ) { }

ngOnInit(): void {
  this.registrationForm = new FormGroup({
    name: new FormControl('',Validators.required),
    email: new FormControl('',[Validators.required,Validators.email,Validators.pattern('^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$')]),
    password: new FormControl('',[Validators.required,Validators.minLength(8)])
  })

}

validate():boolean{
  Object.keys(this.registrationForm.controls).reverse().forEach(key => {
    const controlErrors = this.registrationForm.get(key)?.errors
    if (controlErrors != null)
      Object.keys(controlErrors).forEach(keyError => {
        if(keyError === 'required'){
          var name = key.charAt(0).toLocaleUpperCase() + key.slice(1)
          this.snackBar.error(`${name} is required`)
        } else if(keyError === 'email'){
          this.snackBar.error(`Email have to ba an actuall email :)`)
        } else if(keyError === 'minlength'){
          this.snackBar.error(`Password have to be min 8 characters long`)
        }
        return false;
      })});
  return this.registrationForm.valid;
}

  register() {
    if(!this.validate){
      return
    }

    this.authService.register(this.email,this.password,this.name).subscribe({
      next:() => {
        this.snackBar.success("Success")
        setTimeout(()=> this.router.navigate(['/login']),2000)
      },
      error:(error) => this.snackBar.error(error.error.message)
    })
  }

  checkInputFileds(){

  }

}

