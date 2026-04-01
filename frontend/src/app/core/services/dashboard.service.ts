import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiResponse, DashboardSummary, BranchSummary, RegionSummary,
  EmployeeSummary, KaratBreakdown, MothanSummary, BranchPurchaseRate
} from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  // ── In-memory TTL cache ─────────────────────────────────────────
  private _cache = new Map<string, { data: any; ts: number }>();
  private readonly _TTL = 3 * 60 * 1000; // 3 minutes

  private cached<T>(key: string, req: Observable<T>): Observable<T> {
    const hit = this._cache.get(key);
    if (hit && Date.now() - hit.ts < this._TTL) {
      return of(hit.data as T);
    }
    return req.pipe(tap(data => this._cache.set(key, { data, ts: Date.now() })));
  }

  /** Call after a successful upload so the next load re-fetches fresh data. */
  clearCache(): void { this._cache.clear(); }

  // ── API methods ─────────────────────────────────────────────────
  getSummary(from: string, to: string): Observable<ApiResponse<DashboardSummary>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.cached(`summary:${from}:${to}`,
      this.http.get<ApiResponse<DashboardSummary>>(`${environment.apiUrl}/dashboard/summary`, { params }));
  }

  getBranches(from: string, to: string, region?: string): Observable<ApiResponse<BranchSummary[]>> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (region) params = params.set('region', region);
    return this.cached(`branches:${from}:${to}:${region ?? ''}`,
      this.http.get<ApiResponse<BranchSummary[]>>(`${environment.apiUrl}/dashboard/branches`, { params }));
  }

  getRegions(from: string, to: string): Observable<ApiResponse<any[]>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.cached(`regions:${from}:${to}`,
      this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/dashboard/regions`, { params }));
  }

  getEmployees(from: string, to: string, branchCode?: string, region?: string): Observable<ApiResponse<EmployeeSummary[]>> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (branchCode) params = params.set('branchCode', branchCode);
    if (region) params = params.set('region', region);
    return this.cached(`employees:${from}:${to}:${branchCode ?? ''}:${region ?? ''}`,
      this.http.get<ApiResponse<EmployeeSummary[]>>(`${environment.apiUrl}/dashboard/employees`, { params }));
  }

  getKarat(from: string, to: string): Observable<ApiResponse<KaratBreakdown>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.cached(`karat:${from}:${to}`,
      this.http.get<ApiResponse<KaratBreakdown>>(`${environment.apiUrl}/dashboard/karat`, { params }));
  }

  getMothan(from: string, to: string): Observable<ApiResponse<MothanSummary>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.cached(`mothan:${from}:${to}`,
      this.http.get<ApiResponse<MothanSummary>>(`${environment.apiUrl}/dashboard/mothan`, { params }));
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

  getDailyTrend(from: string, to: string): Observable<ApiResponse<any[]>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.cached(`daily-trend:${from}:${to}`,
      this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/dashboard/daily-trend`, { params }));
  }

  getTargets(month: string): Observable<ApiResponse<any[]>> {
    const params = new HttpParams().set('month', month);
    return this.http.get<ApiResponse<any[]>>(`${environment.apiUrl}/dashboard/targets`, { params });
  }

  getLatestDate(): Observable<ApiResponse<any>> {
    return this.cached('latest-date',
      this.http.get<ApiResponse<any>>(`${environment.apiUrl}/dashboard/latest-date`));
  }
}
