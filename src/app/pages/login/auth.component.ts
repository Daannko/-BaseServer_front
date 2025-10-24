import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, FormControl, FormGroup, FormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../service/auth.service';
import { Router, RouterModule } from '@angular/router';
import { CustomSnackbar } from '../../helpers/snackbar';
import { NgIf } from '@angular/common'; // Updated import path



@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [RouterModule, FormsModule,
    ReactiveFormsModule, NgIf],
  templateUrl: './auth.component.html', // Updated template file name
  styleUrl: './auth.component.scss' // Updated style file name
})
export class AuthComponent { // Updated class name
  isLoginPage: boolean = true;
  email: string = '';
  password: string = '';
  name:string = '';
  loginForm!: FormGroup;
  registrationForm!: FormGroup;
  leavingLogin: boolean = false;
  leavingRegistration: boolean = false;
  private ANIM_MS = 200;

  constructor(
    private authService: AuthService,
    private snackBar: CustomSnackbar,
    private router:Router) { }

  ngOnInit(): void {
    if(this.authService.getFirstLogin()){
      this.authService.checkSession()
      .subscribe({
        next:(data)=>{
            console.log("Check Session go brrrrr: "+ data)
            this.router.navigate(["/"])
        },
      })
    }

    this.loginForm = new FormGroup({
      email: new FormControl('',[Validators.required,Validators.email]),
      password: new FormControl('',[Validators.required])
    })
    this.registrationForm = new FormGroup({
      name: new FormControl('',Validators.required),
      email: new FormControl('',[Validators.required,Validators.email,Validators.pattern('^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$')]),
      password: new FormControl('',[Validators.required,Validators.minLength(8)])
    })
  }

  validateLogin():boolean{
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

  validateRegistration():boolean{
    Object.keys(this.registrationForm.controls).reverse().forEach(key => {
      const controlErrors = this.registrationForm.get(key)?.errors
      if (controlErrors != null){
        Object.keys(controlErrors).forEach(keyError => {
          if(keyError === 'required'){
            var name = key.charAt(0).toLocaleUpperCase() + key.slice(1)
            this.snackBar.error(`${name} is required`)
            return false;
          } else if(keyError === 'email'){
            this.snackBar.error(`Email have to ba an actuall email :)`)
            return false;
          } else if(keyError === 'minlength'){
            this.snackBar.error(`Password have to be min 8 characters long`)
            return false;
          }
          return false;
        })
      }
    });
    return this.registrationForm.valid;
  }


  login() {
    if(!this.validateLogin()){
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

    register() {
    if(!this.validateRegistration) return
    this.authService.register(this.email,this.password,this.name).subscribe({
      next:() => {
        this.snackBar.success("Success")
        setTimeout(()=> this.router.navigate(['/auth']),2000)
      },
      error:(error) => this.snackBar.error(error.error.message)
    })
  }

  changeAuthForm() {
    // subtle animation: mark current form as leaving, wait, then switch
    if (this.isLoginPage) {
      this.leavingLogin = true;
      setTimeout(() => {
        this.isLoginPage = false;
        this.leavingLogin = false;
        this.resetForms();
      }, this.ANIM_MS + 20);
    } else {
      this.leavingRegistration = true;
      setTimeout(() => {
        this.isLoginPage = true;
        this.leavingRegistration = false;
        this.resetForms();
      }, this.ANIM_MS + 20);
    }
  }

  private resetForms() {
    // keep UX tidy when switching
    this.loginForm?.reset();
    this.registrationForm?.reset();
    this.email = '';
    this.password = '';
    this.name = '';
  }
}
