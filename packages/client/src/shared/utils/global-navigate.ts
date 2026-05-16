import type { NavigateFunction } from 'react-router-dom';

let _navigate: NavigateFunction | null = null;

export function setGlobalNavigate(fn: NavigateFunction): void {
  _navigate = fn;
}

export function globalNavigate(to: string): void {
  if (_navigate) {
    _navigate(to);
  } else {
    window.location.assign(to);
  }
}
