import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-super-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar__logo">
          <span class="logo-en">MIZAN</span>
          <span class="logo-ar">ميزان</span>
          <span class="super-badge">SUPER</span>
        </div>
        <nav class="sidebar__nav">
          <a routerLink="/super-admin/dashboard" routerLinkActive="active" class="nav-item">
            <span class="nav-icon">◈</span><span>لوحة التحكم</span>
          </a>
          <a routerLink="/super-admin/tenants" routerLinkActive="active" class="nav-item">
            <span class="nav-icon">⊞</span><span>الشركات</span>
          </a>
          <a routerLink="/super-admin/tiers" routerLinkActive="active" class="nav-item">
            <span class="nav-icon">◑</span><span>خطط الاشتراك</span>
          </a>
        </nav>
        <div class="sidebar__footer">
          <div class="user-info">
            <div class="user-avatar">SA</div>
            <div>
              <div class="user-name">{{ auth.currentUser?.fullName }}</div>
              <div class="user-role">مدير النظام</div>
            </div>
          </div>
          <button class="logout-btn" (click)="auth.logout()">⬡</button>
        </div>
      </aside>
      <main class="app-main"><router-outlet /></main>
    </div>
  `,
  styles: [`
    .app-layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: var(--sidebar-w); height: 100vh; background: #0b1a12;
      display: flex; flex-direction: column; position: fixed; top: 0; left: 0; z-index: 100; overflow-y: auto;
    }
    .sidebar__logo {
      padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,.1);
      display: flex; align-items: baseline; gap: .5rem;
    }
    .logo-en { font-size: 1.4rem; font-weight: 800; color: var(--mizan-gold); letter-spacing: .1em; }
    .logo-ar { font-size: .9rem; color: rgba(255,255,255,.6); }
    .super-badge {
      font-size: .6rem; background: var(--mizan-gold); color: #0d1f17;
      padding: .1rem .4rem; border-radius: 4px; font-weight: 800; margin-inline-start: auto;
    }
    .sidebar__nav { flex: 1; padding: .75rem 0; display: flex; flex-direction: column; }
    .nav-item {
      display: flex; align-items: center; gap: .75rem; padding: .7rem 1.5rem;
      color: rgba(255,255,255,.7); transition: all .2s; font-size: .9rem;
      border-inline-start: 3px solid transparent;
      &:hover { background: rgba(255,255,255,.07); color: #fff; }
      &.active { background: rgba(201,168,76,.15); color: var(--mizan-gold); border-inline-start-color: var(--mizan-gold); }
    }
    .nav-icon { font-size: 1rem; width: 20px; text-align: center; }
    .sidebar__footer { padding: 1rem 1.25rem; border-top: 1px solid rgba(255,255,255,.1); display: flex; align-items: center; gap: .75rem; }
    .user-info { flex: 1; display: flex; align-items: center; gap: .6rem; overflow: hidden; }
    .user-avatar { width: 34px; height: 34px; background: var(--mizan-gold); color: #0d1f17; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: .8rem; flex-shrink: 0; }
    .user-name { font-size: .82rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { font-size: .72rem; color: rgba(255,255,255,.5); }
    .logout-btn { background: none; border: none; color: rgba(255,255,255,.45); font-size: 1.1rem; padding: .35rem; border-radius: 6px; cursor: pointer; &:hover { color: var(--mizan-danger); } }
    .app-main { flex: 1; margin-inline-start: var(--sidebar-w); padding: 1.75rem; }
  `]
})
export class SuperAdminShellComponent {
  auth = inject(AuthService);
}
