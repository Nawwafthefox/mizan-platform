import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TopnavComponent } from '../../shared/components/shell/topnav.component';

@Component({
  selector: 'app-super-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TopnavComponent],
  template: `
    <app-topnav />

    <nav class="sa-subnav" dir="rtl" role="navigation" aria-label="Super Admin Navigation">
      <div class="sa-subnav-inner">
        <a routerLink="/super-admin/dashboard"   routerLinkActive="active" class="sa-tab">الرئيسية</a>
        <a routerLink="/super-admin/tenants"     routerLinkActive="active" class="sa-tab">الشركات</a>
        <a routerLink="/super-admin/tiers"       routerLinkActive="active" class="sa-tab">الباقات</a>
        <a routerLink="/super-admin/users"       routerLinkActive="active" class="sa-tab">المستخدمون</a>
        <a routerLink="/super-admin/audit-logs"  routerLinkActive="active" class="sa-tab">سجل التدقيق</a>
        <a routerLink="/super-admin/upload-logs" routerLinkActive="active" class="sa-tab">سجل الرفع</a>
        <a routerLink="/super-admin/system"      routerLinkActive="active" class="sa-tab sa-tab--system">ضبط النظام ⚙</a>
      </div>
    </nav>

    <main class="app-main">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: block; }

    /* ── Sub-nav ── */
    .sa-subnav {
      position: sticky;
      top: 56px;
      z-index: 90;
      background: #111c16;
      border-bottom: 1px solid rgba(255,255,255,.07);
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
    }

    .sa-subnav-inner {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 0 1.25rem;
      gap: 0;
    }
    .sa-subnav-inner::-webkit-scrollbar { display: none; }

    .sa-tab {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      padding: .65rem 1rem;
      font-size: .82rem;
      font-weight: 500;
      color: rgba(232,228,220,.45);
      text-decoration: none;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: color .2s, border-color .2s;
    }
    .sa-tab:hover { color: rgba(232,228,220,.85); }
    .sa-tab.active {
      color: #c9a84c;
      border-bottom-color: #c9a84c;
    }
    .sa-tab--system { color: rgba(239,68,68,.55); }
    .sa-tab--system:hover { color: rgba(239,68,68,.85); }
    .sa-tab--system.active { color: #ef4444; border-bottom-color: #ef4444; }

    /* ── Main content ── */
    .app-main {
      padding-top: 1.75rem;
      padding-inline: 1.75rem;
      padding-bottom: 2rem;
      min-height: 100vh;
      direction: rtl;
    }
    @media (max-width: 768px) {
      .app-main { padding-top: 1rem; padding-inline: 1rem; }
    }
  `]
})
export class SuperAdminShellComponent {}
