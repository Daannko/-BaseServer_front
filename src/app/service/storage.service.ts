import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';



@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor() {}
  private USER_KEY = "auth-user"

  clean(): void {
    window.sessionStorage.clear();
  }

  public saveUser(user: any): void {
    window.sessionStorage.removeItem(this.USER_KEY);
    window.sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  public getUser(): any {
    const user = window.sessionStorage.getItem(this.USER_KEY);
    if (user) {
      return JSON.parse(user);
    }

    return null;
  }

  public isLoggedIn(): boolean {
    const user = window.sessionStorage.getItem(this.USER_KEY);
    if (user) {
      return true;
    }

    return false;
  }
}

