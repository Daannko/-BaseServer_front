import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

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


  getClientIP() {
    return this.http.get<any>('https://geolocation-db.com/json/',{
    })
 }

 getWeather(lat:string,lon:string) {
  return this.http.get<any>(`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${environment.tomorrowApiKey}`)
}

}
