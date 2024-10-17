import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of, from, throwError, map, catchError, tap, lastValueFrom } from 'rxjs';
import { error } from 'node:console';
import { Router } from '@angular/router';
import { CustomSnackbar } from '../helpers/snackbar';

@Injectable({
  providedIn: 'root'
})
export class AuthService {


  private apiUrl = 'http://localhost:8080/auth/';

  constructor(private http: HttpClient) {}

  refresh(): Observable<any>{
    return this.http.get<any>(this.apiUrl + "refresh")
  }

  checkSession() : Observable<any>{
    return this.http.get(this.apiUrl + "session")
  }

  login(email: string, password: string): Observable<boolean> {
    const body = {
      email: email,
      password: password
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http.post<any>(this.apiUrl + 'token', body, {
      headers,
      withCredentials: true
    })
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
      headers,
      withCredentials: true,
    },);
  }

  getClientIP() : void {
     this.http.get<any>('https://geolocation-db.com/json/',{
     })
    .subscribe(
    {
      next: (response:any) => {

        localStorage.setItem("ClientIP", response.IPv4)
      }

    })

  }



}
