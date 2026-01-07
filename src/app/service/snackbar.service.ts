import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root',
})
export class SnackBarService {
  constructor(private snackBar: MatSnackBar) {}

  success(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 3000, // Slightly longer duration for better visibility
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['snackbar-success'],
    });
  }

  error(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['snackbar-error'],
    });
  }

  info(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['snackbar-info'],
    });
  }
}
