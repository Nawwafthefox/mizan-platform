import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="topbar">
      <div class="topbar__title">
        <h1>MIZAN</h1>
        <span>منصة تحليلات الذهب</span>
      </div>
      <div class="topbar__actions">
        <span class="welcome">مرحباً، {{ auth.currentUser?.fullName }}</span>
        <button class="logout-btn btn btn--ghost btn--sm" (click)="auth.logout()">تسجيل الخروج</button>
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
}
