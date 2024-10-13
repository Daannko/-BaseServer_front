import { Injectable } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";

@Injectable({
  providedIn: 'root'
})
export class CustomSnackbar{

  constructor(private snackBar:MatSnackBar) {}

  success(message: string){
    this.snackBar.open(message, 'Close', {
      duration: 2000, // Set the duration in milliseconds
      horizontalPosition: 'start',
      verticalPosition: 'bottom',
      panelClass: ['snackbar-success']
    });
  }
  error(message: string){
    this.snackBar.open(message, 'Close', {
      duration: 2000, // Set the duration in milliseconds
      horizontalPosition: 'start',
      verticalPosition: 'bottom',
      panelClass: ['snackbar-error']
    });
  }
  info(message: string){
    this.snackBar.open(message, 'Close', {
      duration: 2000, // Set the duration in milliseconds
      horizontalPosition: 'start',
      verticalPosition: 'bottom',
      panelClass: ['snackbar-custom']
    });
  }



}
