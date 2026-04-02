import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cs-page">
      <div class="cs-hero">
        <div class="cs-icon">🚀</div>
        <h1 class="cs-title">Dashboard 3.0</h1>
        <p class="cs-sub">Stay Tuned — Something Impressive is Coming</p>
        <p class="cs-ar">ترقبوا — شيء مذهل قادم</p>

        <div class="cs-features">
          <div class="feature">✅ BCNF Normalized Data</div>
          <div class="feature">✅ Server-Side Calculations</div>
          <div class="feature">✅ 100% Accuracy</div>
          <div class="feature">✅ Secure — No Client-Side Logic</div>
        </div>
      </div>

      @if (isAdmin()) {
        <div class="import-section">
          <div class="import-header" (click)="expanded.set(!expanded())">
            <h3>📥 BCNF Data Import <span class="badge-admin">Admin Only</span></h3>
            <span class="chevron">{{ expanded() ? '▲' : '▼' }}</span>
          </div>

          @if (expanded()) {
            <div class="import-grid">
              @for (card of importCards; track card.type) {
                <div class="import-card" [class.done]="card.count > 0" [class.loading]="card.loading">
                  <div class="import-card__icon">{{ card.icon }}</div>
                  <div class="import-card__label">{{ card.label }}</div>

                  <label class="import-btn" [class.disabled]="card.loading">
                    <input type="file" accept=".xls,.xlsx" hidden
                      (change)="upload(card, $event)" [disabled]="card.loading">
                    @if (card.loading) {
                      <span class="spinner" style="width:12px;height:12px;border-width:2px"></span>
                      جارٍ الاستيراد...
                    } @else {
                      📂 اختيار ملف
                    }
                  </label>

                  @if (card.count > 0) {
                    <div class="import-count">✅ {{ card.count | number }} سجل</div>
                  }
                  @if (card.error) {
                    <div class="import-error">{{ card.error }}</div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cs-page {
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .cs-hero {
      text-align: center;
      padding: 3rem 1rem;
    }

    .cs-icon { font-size: 4rem; margin-bottom: 1rem; }

    .cs-title {
      font-size: 2.5rem;
      font-weight: 800;
      color: var(--mizan-gold);
      margin: 0 0 .5rem;
      letter-spacing: .05em;
    }

    .cs-sub {
      font-size: 1.1rem;
      color: var(--mizan-text);
      margin: 0 0 .25rem;
    }

    .cs-ar {
      font-size: 1rem;
      color: var(--mizan-text-muted);
      margin: 0 0 2rem;
    }

    .cs-features {
      display: flex;
      flex-wrap: wrap;
      gap: .75rem;
      justify-content: center;
      margin-top: 1.5rem;
    }

    .feature {
      background: rgba(201,168,76,.1);
      border: 1px solid rgba(201,168,76,.2);
      color: var(--mizan-gold);
      padding: .4rem 1rem;
      border-radius: 20px;
      font-size: .85rem;
      font-weight: 600;
    }

    /* Import section */
    .import-section {
      margin-top: 2.5rem;
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .import-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      cursor: pointer;
      user-select: none;
    }
    .import-header:hover { background: rgba(255,255,255,.03); }
    .import-header h3 { margin: 0; font-size: .95rem; display: flex; align-items: center; gap: .5rem; }
    .badge-admin {
      font-size: .65rem; font-weight: 700;
      background: rgba(220,38,38,.12); color: #ef4444;
      border: 1px solid rgba(220,38,38,.2);
      padding: .1rem .4rem; border-radius: 4px;
    }
    .chevron { color: var(--mizan-text-muted); font-size: .75rem; }

    .import-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 1rem;
      padding: 1rem 1.25rem 1.25rem;
    }

    .import-card {
      background: var(--mizan-bg);
      border: 1px solid var(--mizan-border);
      border-radius: 10px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
      text-align: center;
      transition: border-color .2s;
    }
    .import-card.done { border-color: var(--mizan-green); }
    .import-card.loading { opacity: .7; }

    .import-card__icon { font-size: 1.8rem; }
    .import-card__label { font-size: .82rem; font-weight: 600; color: var(--mizan-text); }

    .import-btn {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      background: rgba(201,168,76,.1);
      border: 1px solid rgba(201,168,76,.25);
      color: var(--mizan-gold);
      padding: .35rem .75rem;
      border-radius: 6px;
      font-size: .78rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    .import-btn:hover:not(.disabled) { background: rgba(201,168,76,.2); }
    .import-btn.disabled { opacity: .5; cursor: not-allowed; }

    .import-count { font-size: .78rem; color: var(--mizan-green); font-weight: 700; }
    .import-error { font-size: .72rem; color: var(--mizan-danger); text-align: center; }

    .spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(201,168,76,.3);
      border-top-color: var(--mizan-gold);
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ComingSoonComponent {
  private auth = inject(AuthService);
  private http  = inject(HttpClient);

  expanded = signal(false);

  isAdmin = () => {
    const role = this.auth.currentUserSignal()?.role ?? '';
    return ['COMPANY_ADMIN', 'CEO', 'SUPER_ADMIN', 'HEAD_OF_SALES'].includes(role);
  };

  importCards = [
    { type: 'branch-sales',   label: 'مبيعات الفروع',   icon: '📈', loading: false, count: 0, error: '' },
    { type: 'employee-sales', label: 'مبيعات الموظفين', icon: '👤', loading: false, count: 0, error: '' },
    { type: 'purchases',      label: 'المشتريات',        icon: '🛒', loading: false, count: 0, error: '' },
    { type: 'mothan',         label: 'موطن الذهب',       icon: '⚖️', loading: false, count: 0, error: '' },
  ];

  upload(card: typeof this.importCards[0], event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || card.loading) return;
    card.loading = true;
    card.error   = '';
    card.count   = 0;

    const fd = new FormData();
    fd.append('file', file, file.name);

    this.http.post<any>(`${environment.apiUrl}/v3/import/${card.type}`, fd).subscribe({
      next: res => {
        card.loading = false;
        card.count   = res?.data?.count ?? res?.count ?? 0;
      },
      error: err => {
        card.loading = false;
        card.error   = err?.error?.message || err?.error?.error || 'فشل الاستيراد';
      }
    });
  }
}
