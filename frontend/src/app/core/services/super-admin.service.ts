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

  getTiers(): Observable<ApiResponse<SubscriptionTier[]>> {
    return this.http.get<ApiResponse<SubscriptionTier[]>>(`${environment.apiUrl}/super-admin/tiers`);
  }

  createTier(data: any): Observable<ApiResponse<SubscriptionTier>> {
    return this.http.post<ApiResponse<SubscriptionTier>>(`${environment.apiUrl}/super-admin/tiers`, data);
  }

  updateTier(id: string, data: any): Observable<ApiResponse<SubscriptionTier>> {
    return this.http.put<ApiResponse<SubscriptionTier>>(`${environment.apiUrl}/super-admin/tiers/${id}`, data);
  }
}
