import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Tenant, SubscriptionTier, SuperAdminStats } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  constructor(private http: HttpClient) {}

  getStats(): Observable<ApiResponse<SuperAdminStats>> {
    return this.http.get<ApiResponse<SuperAdminStats>>(`${environment.apiUrl}/super-admin/stats`);
  }

  getTenants(page = 0, size = 20): Observable<ApiResponse<any>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants`, { params });
  }

  createTenant(data: any): Observable<ApiResponse<Tenant>> {
    return this.http.post<ApiResponse<Tenant>>(`${environment.apiUrl}/super-admin/tenants`, data);
  }

  updateTenant(tenantId: string, data: any): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}`, data);
  }

  addAdmin(tenantId: string, data: { email: string; password: string; fullNameAr?: string }): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/add-admin`, data);
  }

  suspendTenant(tenantId: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/suspend`, null);
  }

  activateTenant(tenantId: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/activate`, null);
  }

  impersonate(tenantId: string): Observable<ApiResponse<{ impersonationToken: string; tenantName: string }>> {
    return this.http.post<ApiResponse<{ impersonationToken: string; tenantName: string }>>(
      `${environment.apiUrl}/super-admin/impersonate`, { tenantId });
  }

  getUsersByTenant(tenantId: string): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/users`);
  }

  getTiers(): Observable<ApiResponse<SubscriptionTier[]>> {
    return this.http.get<ApiResponse<SubscriptionTier[]>>(`${environment.apiUrl}/super-admin/tiers`);
  }

  createTier(data: any): Observable<ApiResponse<SubscriptionTier>> {
    return this.http.post<ApiResponse<SubscriptionTier>>(`${environment.apiUrl}/super-admin/tiers`, data);
  }

  updateTier(id: string, data: any): Observable<ApiResponse<SubscriptionTier>> {
    return this.http.put<ApiResponse<SubscriptionTier>>(`${environment.apiUrl}/super-admin/tiers/${id}`, data);
  }

  // ── Users (platform-wide) ──
  getAllUsers(params?: { tenantId?: string; search?: string; role?: string }): Observable<ApiResponse<any[]>> {
    let p = new HttpParams();
    if (params?.tenantId) p = p.set('tenantId', params.tenantId);
    if (params?.search)   p = p.set('search',   params.search);
    if (params?.role)     p = p.set('role',      params.role);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/super-admin/users`, { params: p });
  }

  deactivateUser(userId: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/super-admin/users/${userId}/deactivate`, {});
  }

  activateUser(userId: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/super-admin/users/${userId}/activate`, {});
  }

  resetUserPassword(userId: string, newPassword: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/super-admin/users/${userId}/reset-password`, { newPassword });
  }

  // ── Audit Logs ──
  getAuditLogs(params?: { tenantId?: string; action?: string; limit?: number }): Observable<ApiResponse<any[]>> {
    let p = new HttpParams();
    if (params?.tenantId) p = p.set('tenantId', params.tenantId);
    if (params?.action)   p = p.set('action',   params.action);
    if (params?.limit)    p = p.set('limit',     params.limit);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/super-admin/audit`, { params: p });
  }

  // ── Upload Logs ──
  getUploadLogs(tenantId?: string): Observable<ApiResponse<any[]>> {
    let p = new HttpParams();
    if (tenantId) p = p.set('tenantId', tenantId);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/super-admin/upload-logs`, { params: p });
  }

  // ── Tenant Features ──
  updateTenantFeatures(tenantId: string, data: any): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/features`, data);
  }

  wipeTenantData(tenantId: string, reason?: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/wipe`, { reason });
  }

  // ── Announcements ──
  getAnnouncements(activeOnly = false): Observable<ApiResponse<any[]>> {
    const p = new HttpParams().set('activeOnly', activeOnly);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/super-admin/announcements`, { params: p });
  }

  createAnnouncement(data: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/super-admin/announcements`, data);
  }

  updateAnnouncement(id: string, data: any): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${environment.apiUrl}/super-admin/announcements/${id}`, data);
  }

  deleteAnnouncement(id: string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${environment.apiUrl}/super-admin/announcements/${id}`);
  }
}
