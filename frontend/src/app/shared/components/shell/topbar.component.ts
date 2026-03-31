import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="topbar" [attr.dir]="i18n.lang()">
      <div class="topbar__title">
        <h1>MIZAN</h1>
        <span>{{ i18n.isAr() ? 'منصة تحليلات الذهب' : 'Gold Analytics Platform' }}</span>
      </div>
      <div class="topbar__actions">
        <div class="lang-toggle" (click)="i18n.toggle()" title="Switch Language">
          <span [class.active]="i18n.isAr()">AR</span>
          <span [class.active]="!i18n.isAr()">EN</span>
        </div>
        <span class="welcome">
          {{ i18n.isAr() ? 'مرحباً،' : 'Welcome,' }}
          {{ auth.currentUser?.fullName }}
        </span>
        <button class="logout-btn btn btn--ghost btn--sm" (click)="auth.logout()">
          {{ i18n.isAr() ? 'تسجيل الخروج' : 'Sign Out' }}
        </button>
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      height: var(--topbar-h);
      background: var(--mizan-surface);
      border-bottom: 1px solid var(--mizan-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.5rem;
      box-shadow: var(--shadow);
    }
    .topbar__title { display: flex; align-items: baseline; gap: .75rem; }
    h1 { font-size: 1.1rem; font-weight: 800; color: var(--mizan-green-dark); letter-spacing: .08em; }
    span { font-size: .8rem; color: var(--mizan-text-muted); }
    .topbar__actions { display: flex; align-items: center; gap: 1rem; }
    .welcome { font-size: .85rem; color: var(--mizan-text-muted); }
    .logout-btn { font-size: .8rem; }
  `]
})
export class TopbarComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);
}
