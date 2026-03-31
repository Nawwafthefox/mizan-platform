import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, AuthResponse, User } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.userSubject.asObservable();
  impersonating = signal<string | null>(localStorage.getItem('is_impersonating'));

  constructor(private http: HttpClient, private router: Router) {
    const stored = localStorage.getItem('user');
    if (stored && stored !== 'null') {
      try { this.userSubject.next(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }

  login(usernameOrEmail: string, password: string): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(
      `${environment.apiUrl}/auth/login`, { usernameOrEmail, password }
    ).pipe(tap(res => {
      if (res.success && res.data) {
        localStorage.setItem('access_token', res.data.accessToken);
        localStorage.setItem('refresh_token', res.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        this.userSubject.next(res.data.user);
      }
    }));
  }

  logout(): void {
    localStorage.clear();
    this.userSubject.next(null);
    this.impersonating.set(null);
    this.router.navigate(['/auth/login']);
  }

  get currentUser(): User | null {
    if (this.userSubject.value) return this.userSubject.value;
    const stored = localStorage.getItem('user');
    if (stored && stored !== 'null') {
      try {
        const u = JSON.parse(stored);
        if (u) { this.userSubject.next(u); return u; }
      } catch { /* ignore */ }
    }
    return null;
  }

  get token(): string | null { return localStorage.getItem('access_token'); }

  isAuthenticated(): boolean {
    const token = this.token;
    if (!token || !this.currentUser) return false;
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      return payload.exp * 1000 > Date.now();
    } catch { return false; }
  }

  get isLoggedIn(): boolean { return this.isAuthenticated(); }

  hasRole(...roles: string[]): boolean {
    return this.currentUser ? roles.includes(this.currentUser.role) : false;
  }

  hasFullAccess(): boolean {
    return this.hasRole('SUPER_ADMIN', 'CEO', 'HEAD_OF_SALES');
  }

  changePassword(oldPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/change-password`, null,
      { params: { oldPassword, newPassword } });
  }

  refreshToken(): Observable<ApiResponse<AuthResponse>> {
    const refresh = localStorage.getItem('refresh_token') ?? '';
    return this.http.post<ApiResponse<AuthResponse>>(
      `${environment.apiUrl}/auth/refresh`, null, { params: { refreshToken: refresh } }
    ).pipe(tap(res => {
      if (res.success && res.data) {
        localStorage.setItem('access_token', res.data.accessToken);
        localStorage.setItem('refresh_token', res.data.refreshToken);
      }
    }));
  }

  startImpersonation(token: string, tenantId: string, companyName: string): void {
    localStorage.setItem('imp_orig_token', localStorage.getItem('access_token') || '');
    localStorage.setItem('imp_orig_refresh', localStorage.getItem('refresh_token') || '');
    localStorage.setItem('imp_orig_user', localStorage.getItem('user') || '');
    localStorage.setItem('is_impersonating', companyName);
    const fakeUser: any = { role: 'COMPANY_ADMIN', tenantId, fullName: companyName, email: '', mustChangePassword: false };
    localStorage.setItem('access_token', token);
    localStorage.setItem('user', JSON.stringify(fakeUser));
    this.userSubject.next(fakeUser);
    this.impersonating.set(companyName);
    this.router.navigate(['/dashboard']);
  }

  endImpersonation(): void {
    const origToken = localStorage.getItem('imp_orig_token') || '';
    const origRefresh = localStorage.getItem('imp_orig_refresh') || '';
    const origUser = localStorage.getItem('imp_orig_user') || '';
    localStorage.setItem('access_token', origToken);
    localStorage.setItem('refresh_token', origRefresh);
    localStorage.setItem('user', origUser);
    localStorage.removeItem('imp_orig_token');
    localStorage.removeItem('imp_orig_refresh');
    localStorage.removeItem('imp_orig_user');
    localStorage.removeItem('is_impersonating');
    try { this.userSubject.next(JSON.parse(origUser)); } catch { this.userSubject.next(null); }
    this.impersonating.set(null);
    this.router.navigate(['/super-admin/tenants']);
  }
}
