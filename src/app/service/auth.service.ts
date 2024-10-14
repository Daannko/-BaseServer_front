import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken, HttpHeaders, HttpResponse } from '@angular/common/http';
import { catchError, Observable } from 'rxjs';
import { error } from 'node:console';
import { BYPASS_LOG } from '../interceptors/jwt.interceptor';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:8080/auth/';  // Your backend endpoint

  constructor(private http: HttpClient) { }

  login(email: string, password: string): Observable<any> {
    const body = {
      email: email,
      password: password
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http.post<any>(this.apiUrl + 'token', body, {
      context: new HttpContext().set(BYPASS_LOG, true),
      headers,
      withCredentials: true
    },);
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
      context: new HttpContext().set(BYPASS_LOG, true),
      headers,
      withCredentials: true,
    },);
  }

  getClientIP() : void {
     this.http.get<any>('https://geolocation-db.com/json/',{
      context: new HttpContext().set(BYPASS_LOG, true),
     })
    .subscribe(
    {
      next: (response:any) => {
        debugger;
        localStorage.setItem("ClientIP", response.IPv4)
      }

    })

  }



}
