import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:8080/auth/';  // Your backend endpoint

  constructor(private http: HttpClient) { }

  // Function to send a POST request to the server
  login(email: string, password: string): Observable<any> {
    // Prepare the body of the request
    const body = {
      email: email,
      password: password
    };

    // Prepare headers if needed
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    // Options including headers and credentials
    // Send POST request to backend
    return this.http.post<any>(this.apiUrl + 'token', body, {
      headers,
    },);
  }

  test(username: string, password: string): Observable<any> {


    // Prepare headers if needed
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'


    });

    // Send POST request to backend
    return this.http.post(this.apiUrl + "test2",null, {
      headers,
      'responseType': 'text'
    },);
  }

}
