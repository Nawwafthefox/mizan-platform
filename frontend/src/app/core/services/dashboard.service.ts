import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse, DashboardSummary, BranchSummary, RegionSummary,
  EmployeeSummary, KaratBreakdown, MothanSummary, BranchPurchaseRate
} from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getSummary(from: string, to: string): Observable<ApiResponse<DashboardSummary>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ApiResponse<DashboardSummary>>(`${environment.apiUrl}/dashboard/summary`, { params });
  }

  getBranches(from: string, to: string, region?: string): Observable<ApiResponse<BranchSummary[]>> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (region) params = params.set('region', region);
    return this.http.get<ApiResponse<BranchSummary[]>>(`${environment.apiUrl}/dashboard/branches`, { params });
  }

  getRegions(from: string, to: string): Observable<ApiResponse<any[]>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/dashboard/regions`, { params });
  }

  getEmployees(from: string, to: string, branchCode?: string, region?: string): Observable<ApiResponse<EmployeeSummary[]>> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (branchCode) params = params.set('branchCode', branchCode);
    if (region) params = params.set('region', region);
    return this.http.get<ApiResponse<EmployeeSummary[]>>(`${environment.apiUrl}/dashboard/employees`, { params });
  }

  getKarat(from: string, to: string): Observable<ApiResponse<KaratBreakdown>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ApiResponse<KaratBreakdown>>(`${environment.apiUrl}/dashboard/karat`, { params });
  }

  getMothan(from: string, to: string): Observable<ApiResponse<MothanSummary>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ApiResponse<MothanSummary>>(`${environment.apiUrl}/dashboard/mothan`, { params });
  }

  getAlerts(from: string, to: string): Observable<ApiResponse<any[]>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/dashboard/alerts`, { params });
  }

  getComparison(d1: string, d2: string): Observable<ApiResponse<any>> {
    const params = new HttpParams().set('d1', d1).set('d2', d2);
    return this.http.get<ApiResponse<any>>(`${environment.apiUrl}/dashboard/comparison`, { params });
  }

  getPurchaseRates(): Observable<ApiResponse<BranchPurchaseRate[]>> {
    return this.http.get<ApiResponse<BranchPurchaseRate[]>>(`${environment.apiUrl}/dashboard/purchase-rates`);
  }

  upsertPurchaseRate(data: { branchCode: string; branchName: string; purchaseRate: number }): Observable<ApiResponse<BranchPurchaseRate>> {
    return this.http.post<ApiResponse<BranchPurchaseRate>>(`${environment.apiUrl}/dashboard/purchase-rates`, data);
  }
}
