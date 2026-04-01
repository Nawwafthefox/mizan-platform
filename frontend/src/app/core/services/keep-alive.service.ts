import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Pings the backend health endpoint every 10 minutes to prevent
 * Render free-tier from spinning down the instance.
 */
@Injectable({ providedIn: 'root' })
export class KeepAliveService implements OnDestroy {
  private http = inject(HttpClient);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private readonly INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  private readonly healthUrl = environment.apiUrl.replace('/api', '') + '/actuator/health';

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.ping(), this.INTERVAL_MS);
  }

  private ping(): void {
    this.http.get(this.healthUrl, { responseType: 'json' })
      .subscribe({ error: () => {} }); // silently ignore errors
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
