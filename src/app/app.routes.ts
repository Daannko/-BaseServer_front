import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { LayoutComponent } from './pages/layout/layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { RegisterComponent } from './pages/register/register.component';
import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';


export const routes: Routes = [

  {path: 'login',component: LoginComponent},
  {path: 'register',component: RegisterComponent},
  {path:'', component: HomeComponent,
    children:[
      {path:'dashboard',
        component:DashboardComponent
      }
    ],
    canActivate: [authGuard]
  },


];
