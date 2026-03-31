import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, User } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class UserManagementService {
  constructor(private http: HttpClient) {}

  getAll(page = 0, size = 20): Observable<ApiResponse<any>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ApiResponse<any>>(`${environment.apiUrl}/users`, { params });
  }

  create(data: any): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>(`${environment.apiUrl}/users`, data);
  }

  update(id: string, data: any): Observable<ApiResponse<User>> {
    return this.http.put<ApiResponse<User>>(`${environment.apiUrl}/users/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/users/${id}`);
  }

  toggleStatus(id: string): Observable<ApiResponse<User>> {
    return this.http.patch<ApiResponse<User>>(`${environment.apiUrl}/users/${id}/toggle-status`, null);
  }

  resetPassword(id: string, newPassword: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/users/${id}/reset-password`, null, { params: { newPassword } });
  }
}
