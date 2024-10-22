import { inject, Injectable } from '@angular/core';
import { CanActivate, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth.service';
import { CustomSnackbar } from '../helpers/snackbar';
import { StorageService } from '../service/storage.service';
import { UserService } from '../service/user.service';
import { catchError, map, Observable, of, tap } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class authGuard implements CanActivate {
  constructor(
    private storageService: StorageService,
    private userService: UserService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return this.userService.getUserData().pipe(
      tap((userData) => {
        this.storageService.saveUser(userData);
      }),
      map(() => {
        if (this.storageService.isLoggedIn()) {
          return true;
        } else {
          console.log("Failed to load user")
          this.router.navigate(['/login']);
          return false;
        }
      }),
      catchError((error) => {
        console.error('Error fetching user data', error);
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
}
