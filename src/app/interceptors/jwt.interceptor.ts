import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
export const BYPASS_LOG = new HttpContextToken(() => false);

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  if(BYPASS_LOG){
    return next(req);
  }

  let jwt = localStorage.getItem('jwt');
  if(jwt){
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${jwt}`
      }
    })
  }
  return next(req);
};
