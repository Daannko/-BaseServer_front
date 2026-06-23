import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HTTP_INTERCEPTORS,
  HttpErrorResponse,
} from '@angular/common/http';

import { Observable, Subject, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { StorageService } from '../service/storage.service';
import { AuthService } from '../service/auth.service';
import { EventData } from '../shared/event.class';
import { EventService } from '../service/event.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  /** Notifies requests that queued behind an in-flight refresh that the token
   *  is renewed and they may retry. */
  private refreshDone$ = new Subject<void>();

  constructor(
    private storageService: StorageService,
    private authService: AuthService,
    private eventService: EventService
  ) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (req.url.includes('geolocation-db.com/json/')) {
      return next.handle(req);
    }
    req = req.clone({
      withCredentials: true,
    });
    return next.handle(req).pipe(
      catchError((error) => {
        if (
          error instanceof HttpErrorResponse &&
          !req.url.includes('auth/signin') &&
          (error.status === 401 || error.status === 462)
        ) {
          return this.handle401Error(req, next);
        }

        return throwError(() => error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler) {
    // A refresh is already in flight — queue this request and retry it only
    // after the refresh resolves, so concurrent saves never fire with a stale
    // token (and never get silently dropped).
    if (this.isRefreshing) {
      return this.refreshDone$.pipe(
        take(1),
        switchMap(() => next.handle(request)),
      );
    }

    // Not logged in — nothing to refresh. Pass the request through and let the
    // caller handle the 401 (e.g. the auth guard / login page). Do NOT emit a
    // logout event here: on /auth these 401s fire continuously and would spam
    // the "session expired" popup.
    if (!this.storageService.isLoggedIn()) {
      return next.handle(request);
    }

    this.isRefreshing = true;
    return this.authService.refresh().pipe(
      switchMap(() => {
        this.isRefreshing = false;
        // Release every request queued behind this refresh.
        this.refreshDone$.next();
        return next.handle(request);
      }),
      catchError((error) => {
        this.isRefreshing = false;
        // Wake the queued requests; their own retry will fail and surface the
        // error rather than hang forever.
        this.refreshDone$.next();

        if (error.status == '462' || error.status === 462) {
          this.eventService.emit(new EventData('logout', null));
        }

        return throwError(() => error);
      }),
    );
  }
}

export const httpInterceptorProviders = [
  { provide: HTTP_INTERCEPTORS, useClass: HttpRequestInterceptor, multi: true },
];
