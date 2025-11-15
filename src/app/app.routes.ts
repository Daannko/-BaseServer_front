import { Routes } from '@angular/router';
import { AuthComponent } from './pages/login/auth.component'; // Updated import path
import { LayoutComponent } from './pages/layout/layout.component';
import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { LogoutComponent } from './helpers/logout';
import { BoardComponent } from './pages/board/board.component';


export const routes: Routes = [
  { path: 'auth', component: AuthComponent },
  { path: 'board', component: BoardComponent },// Updated path and component
  { path: 'logout', component: LogoutComponent },
  { path: '', component: HomeComponent,

    canActivate: [authGuard]
  },
];
