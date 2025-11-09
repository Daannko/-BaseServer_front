import { Routes } from '@angular/router';
import { AuthComponent } from './pages/login/auth.component'; // Updated import path
import { LayoutComponent } from './pages/layout/layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { LogoutComponent } from './helpers/logout';
import { BoardComponent } from './pages/board/board.component';


export const routes: Routes = [
  { path: 'auth', component: AuthComponent }, // Updated path and component
  { path: 'logout', component: LogoutComponent },
  { path: 'board', component: BoardComponent },
  { path: '', component: HomeComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent }
    ],
    canActivate: [authGuard]
  },
];
