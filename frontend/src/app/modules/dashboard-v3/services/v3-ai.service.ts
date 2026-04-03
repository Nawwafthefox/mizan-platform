import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

interface CacheEntry { data: any; ts: number; }

@Injectable({ providedIn: 'root' })
export class V3AIService {
  private http  = inject(HttpClient);
  private cache = new Map<string, CacheEntry>();
  private TTL   = 10 * 60 * 1000; // 10 min — mirrors backend AI cache

  getInsights(feature: string, from: string, to: string): Observable<any> {
    const key    = `ai:${feature}:${from}:${to}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return of(cached.data);
    return this.http
      .get<{ success: boolean; data: any }>(
        `${environment.apiUrl}/v3/ai/${feature}`,
        { params: { from, to } }
      )
      .pipe(map(r => {
        this.cache.set(key, { data: r.data, ts: Date.now() });
        return r.data;
      }));
  }

  /** Free-form chat — never cached. */
  chat(question: string, from: string, to: string): Observable<any> {
    return this.http
      .post<{ success: boolean; data: any }>(
        `${environment.apiUrl}/v3/ai/chat`,
        { question },
        { params: { from, to } }
      )
      .pipe(map(r => r.data));
  }
}
