import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpContextToken,
  HttpHeaders,
  HttpResponse,
} from '@angular/common/http';
import {
  Observable,
  of,
  from,
  throwError,
  map,
  catchError,
  tap,
  lastValueFrom,
  finalize,
} from 'rxjs';
import { error } from 'node:console';
import { Router } from '@angular/router';
import { SnackBarService } from './snackbar.service';
import { response } from 'express';
import { environment } from '../../environments/environment';
import { BOARD_BACKUP_PREFIX } from '../pages/board/board-persistence.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth/`;
  private firstLogin = true;

  constructor(
    private http: HttpClient,
    private router: Router,
    private snackBar: SnackBarService,
  ) {}

  refresh(options?: any): Observable<any> {
    return this.http.get<any>(this.apiUrl + 'refresh', options);
  }

  public getFirstLogin(): boolean {
    return this.firstLogin;
  }

  checkSession(): Observable<any> {
    return this.refresh({ observe: 'response' });
  }

  login(email: string, password: string): Observable<boolean> {
    const body = {
      email: email,
      password: password,
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http.post<any>(this.apiUrl + 'login', body, {
      headers,
    });
  }

  register(email: string, password: string, name: string): Observable<any> {
    const body = {
      email: email,
      password: password,
      name: name,
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http.post<any>(this.apiUrl + 'register', body, {
      headers,
    });
  }

  /** `expired`: the session ran out rather than the user logging out. */
  logout(expired = false) {
    window.sessionStorage.clear();
    // Keep board backups: they hold changes that never reached the server.
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(BOARD_BACKUP_PREFIX)) localStorage.removeItem(key);
    }
    this.firstLogin = false;
    // An expired session makes this call fail too: go to login either way.
    this.http
      .get<any>(this.apiUrl + 'logout')
      .pipe(finalize(() => this.router.navigate(['/auth'])))
      .subscribe({ error: () => {} });
    if (expired) {
      this.snackBar.error(
        'Session expired. Log in again: unsaved board changes are kept in this browser.',
        10000,
      );
    } else {
      this.snackBar.success('Successfuly loged out');
    }
  }
}
