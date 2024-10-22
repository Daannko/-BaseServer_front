import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of, from, throwError, map, catchError, tap, lastValueFrom, finalize } from 'rxjs';
import { error } from 'node:console';
import { Router } from '@angular/router';
import { CustomSnackbar } from '../helpers/snackbar';
import { response } from 'express';

@Injectable({
  providedIn: 'root'
})
export class AuthService {


  private apiUrl = 'http://localhost:8080/auth/';
  private validSession = false;

  constructor(
    private http: HttpClient,
    private router:Router,
    private snackBar:CustomSnackbar
  ) {}

  refresh(options?:any): Observable<any>{
    return this.http.get<any>(this.apiUrl + "refresh", options)
  }

  isSessionValid():boolean{
    return this.validSession;
  }

  checkSession() : Observable<any>{
    return this.refresh({ observe: 'response' }).pipe(
      tap((response:any) => {
        this.validSession = response.status > 199 && response.status < 300
      }))
  }

  login(email: string, password: string): Observable<boolean> {
    const body = {
      email: email,
      password: password
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http.post<any>(this.apiUrl + 'login', body, {
      headers
    })
    .pipe(
      tap((response:any) => {
        if(response != null)
          this.validSession = response.status > 199 && response.status < 300
    }))
  }

  register(email: string, password: string,name:string): Observable<any> {
    const body = {
      email: email,
      password: password,
      name: name
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http.post<any>(this.apiUrl + 'register', body, {
      headers
    },);
  }

  logout(){
    window.sessionStorage.clear()
    localStorage.clear()
    this.http.get<any>(this.apiUrl + 'logout' ).subscribe({
      complete:()=> this.router.navigate(['/login'])
    });
    this.snackBar.success("Successfuly loged out")
  }
}
