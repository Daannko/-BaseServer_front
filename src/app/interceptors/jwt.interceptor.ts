import { HttpInterceptorFn } from '@angular/common/http';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  debugger;
  let jwt = localStorage.getItem('jwt');
  if(jwt){
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${jwt}`
      }
    })
  }
  debugger;
  return next(req);
};
