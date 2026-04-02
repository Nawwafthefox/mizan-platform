import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

interface CacheEntry {
  data: any;
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class V3DashboardService {
  private http   = inject(HttpClient);
  private cache  = new Map<string, CacheEntry>();
  private TTL    = 60_000;

  private get<T>(path: string, params: Record<string, string>): Observable<T> {
    const key    = path + JSON.stringify(params);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) {
      return of(cached.data as T);
    }
    return this.http
      .get<{ success: boolean; data: T }>(
        `${environment.apiUrl}/v3/dashboard/${path}`,
        { params }
      )
      .pipe(
        map(r => {
          this.cache.set(key, { data: r.data, ts: Date.now() });
          return r.data;
        })
      );
  }

  getOverview(from: string, to: string): Observable<any> {
    return this.get<any>('overview', { from, to });
  }

  getBranchSummary(from: string, to: string): Observable<any[]> {
    return this.get<any[]>('branch-summary', { from, to });
  }

  getEmployeePerformance(from: string, to: string): Observable<any[]> {
    return this.get<any[]>('employee-performance', { from, to });
  }

  getDailyTrend(from: string, to: string): Observable<any[]> {
    return this.get<any[]>('daily-trend', { from, to });
  }

  getTargetAchievement(from: string, to: string): Observable<any[]> {
    return this.get<any[]>('target-achievement', { from, to });
  }

  getRegions(from: string, to: string): Observable<any[]> {
    return this.get<any[]>('regions', { from, to });
  }

  getKaratBreakdown(from: string, to: string): Observable<any> {
    return this.get<any>('karat-breakdown', { from, to });
  }

  getMothanDetail(from: string, to: string): Observable<any> {
    return this.get<any>('mothan-detail', { from, to });
  }

  getComparison(d1: string, d2: string): Observable<any> {
    return this.get<any>('comparison', { d1, d2 });
  }

  getAlerts(from: string, to: string): Observable<any[]> {
    return this.get<any[]>('alerts', { from, to });
  }

  getPremiumAnalytics(from: string, to: string): Observable<any> {
    return this.get<any>('premium-analytics', { from, to });
  }

  invalidateCache(): void {
    this.cache.clear();
  }
}
