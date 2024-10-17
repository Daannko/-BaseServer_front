import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor(private http: HttpClient) {
  }

  private apiUrl = 'http://localhost:8080/user/';

  getUserData(){
      return this.http.get<any>(this.apiUrl + 'me',{
        withCredentials: true
      });
  }

}
