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

        <a routerLink="/super-admin/dashboard"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="لوحة المقاييس والإحصاءات العامة">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">الرئيسية</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/tenants"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="إدارة شركات وحسابات المستأجرين">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">الشركات</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/tiers"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="إدارة باقات وخطط الاشتراك">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">الباقات</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/users"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="إدارة مستخدمي النظام">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">المستخدمون</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/audit-logs"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="سجل جميع العمليات والتغييرات">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">سجل التدقيق</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/upload-logs"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="سجل عمليات رفع الملفات">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">سجل الرفع</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/ai-usage"
           routerLinkActive="active"
           class="sa-tab"
           data-tooltip="مراقبة استخدام Gemini AI والميزانيات">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">🤖 استخدام AI</span>
          <span class="sa-tab__bar"></span>
        </a>

        <a routerLink="/super-admin/system"
           routerLinkActive="active"
           class="sa-tab sa-tab--system"
           data-tooltip="إعدادات النظام والتكوين العام">
          <span class="sa-tab__pill"></span>
          <span class="sa-tab__label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="flex-shrink:0">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93l-1.41 1.41M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M12 22v-2M19.07 19.07l-1.41-1.41M22 12h-2"/>
            </svg>
            ضبط النظام
          </span>
          <span class="sa-tab__bar"></span>
        </a>

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
      background: rgba(14, 24, 18, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(201,168,76,.1);
      box-shadow: 0 2px 16px rgba(0,0,0,.4);
    }

    .sa-subnav-inner {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 0 1.25rem;
      gap: 0;
      max-width: 1600px;
    }
    .sa-subnav-inner::-webkit-scrollbar { display: none; }

    /* ── Tab ── */
    .sa-tab {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: .3rem;
      padding: 0 .9rem;
      height: 42px;
      font-size: .82rem;
      font-weight: 600;
      color: rgba(232,228,220,.4);
      text-decoration: none;
      white-space: nowrap;
      position: relative;
      transition: color 200ms cubic-bezier(0.22,1,0.36,1);
    }

    /* Hover pill */
    .sa-tab__pill {
      position: absolute;
      inset-block: 6px;
      inset-inline: 2px;
      background: rgba(201,168,76,0.08);
      border-radius: 6px;
      opacity: 0;
      transform: scaleY(0.6);
      transition: opacity 200ms cubic-bezier(0.22,1,0.36,1),
                  transform 200ms cubic-bezier(0.22,1,0.36,1);
      pointer-events: none;
    }

    .sa-tab__label {
      position: relative; z-index: 1;
      display: flex; align-items: center; gap: .3rem;
    }

    /* Active slide indicator */
    .sa-tab__bar {
      position: absolute;
      bottom: 0;
      inset-inline: 6px;
      height: 2px;
      background: linear-gradient(90deg, #c9a84c, #e3c76a);
      border-radius: 2px 2px 0 0;
      opacity: 0;
      transform: scaleX(0);
      transition: opacity 220ms cubic-bezier(0.22,1,0.36,1),
                  transform 220ms cubic-bezier(0.22,1,0.36,1);
      pointer-events: none;
    }

    .sa-tab:hover {
      color: rgba(232,228,220,.82);
      .sa-tab__pill {
        opacity: 1;
        transform: scaleY(1);
      }
    }

    .sa-tab.active {
      color: #c9a84c;
      .sa-tab__pill {
        opacity: 1;
        transform: scaleY(1);
        background: rgba(201,168,76,0.11);
      }
      .sa-tab__bar {
        opacity: 1;
        transform: scaleX(1);
      }
    }

    /* System tab */
    .sa-tab--system { color: rgba(239,68,68,.5); }
    .sa-tab--system:hover {
      color: rgba(239,68,68,.85);
      .sa-tab__pill { background: rgba(239,68,68,0.08); }
    }
    .sa-tab--system.active {
      color: #ef4444;
      .sa-tab__bar { background: linear-gradient(90deg, #ef4444, #f87171); }
    }

    /* Tooltip shows below for subnav */
    .sa-tab[data-tooltip]::after {
      bottom: auto;
      top: calc(100% + 6px);
      font-size: 10.5px;
    }
    .sa-tab[data-tooltip]::before {
      bottom: auto;
      top: calc(100% + 1px);
      border-top-color: transparent;
      border-bottom-color: rgba(201,168,76,0.22);
    }

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
