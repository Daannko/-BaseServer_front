import { Injectable, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface NavbarState {
  visible?: boolean;
  template?: TemplateRef<any> | null;
  context?: any;
}

@Injectable({ providedIn: 'root' })
export class NavbarService {
  private _state = new BehaviorSubject<NavbarState>({});
  readonly state$ = this._state.asObservable();

  setTemplate(template: TemplateRef<any>, context?: any) {
    this._state.next({ ...this._state.value, template, context, visible: true });
  }

  setState(state: NavbarState) {
    this._state.next({ ...this._state.value, ...state });
  }

  clear() {
    this._state.next({});
  }
}
