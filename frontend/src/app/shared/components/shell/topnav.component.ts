import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';

interface NavItem {
  labelAr: string;
  labelEn: string;
  route: string;
  roles?: string[];
  badge?: string;
}

@Component({
  selector: 'app-topnav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="topnav" [attr.dir]="i18n.lang()">

      <!-- Logo -->
      <a [routerLink]="logoRoute()" class="topnav__logo" dir="ltr">
        <span class="logo-mark">M</span>
        <span class="logo-text">
          <span class="logo-en">MIZAN</span>
          <span class="logo-ar">ميزان</span>
        </span>
      </a>

      @if (auth.impersonating()) {
        <div class="imp-badge">
          <span class="imp-indicator"></span>
          <span>{{ auth.impersonating() }}</span>
          <button (click)="auth.endImpersonation()">خروج</button>
        </div>
      }

      <!-- Nav tabs -->
      <div class="topnav__tabs">
        @for (item of visibleItems(); track item.route) {
          <a
            [routerLink]="item.route"
            routerLinkActive="active"
            class="nav-tab"
            [class.studio-nav-link]="item.badge"
            [attr.data-tooltip]="i18n.isAr() ? item.labelEn : item.labelAr"
          >
            <span class="nav-tab__pill"></span>
            <span class="nav-tab__label">
              {{ i18n.isAr() ? item.labelAr : item.labelEn }}
            </span>
            @if (item.badge) {
              <span class="studio-2-badge">{{ item.badge }}</span>
            }
            <span class="nav-tab__indicator"></span>
          </a>
        }
      </div>

      <!-- Right actions -->
      <div class="topnav__actions">

        <div
          class="lang-toggle lang-toggle--light"
          (click)="i18n.toggle()"
          data-tooltip="Switch Language"
        >
          <span [class.active]="i18n.isAr()">AR</span>
          <span [class.active]="!i18n.isAr()">EN</span>
        </div>

        <div
          class="user-chip"
          [attr.data-tooltip]="auth.currentUserSignal()?.fullName"
        >
          <div class="user-avatar">{{ initials() }}</div>
          <span class="user-name">{{ auth.currentUserSignal()?.fullName }}</span>
        </div>

        <button
          class="logout-btn"
          (click)="auth.logout()"
          data-tooltip="تسجيل الخروج / Sign Out"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>

      </div>
    </nav>
  `,
  styles: [`
    .topnav {
      position: fixed;
      top: 0;
      inset-inline-start: 0;
      inset-inline-end: 0;
      height: var(--mz-nav-h, 56px);
      background: rgba(11, 26, 18, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(201,168,76,.16);
      display: flex;
      align-items: center;
      gap: 0;
      z-index: 200;
      padding: 0 1rem;
      box-shadow: 0 2px 24px rgba(0,0,0,.5), 0 1px 0 rgba(201,168,76,0.06);
    }

    /* ── Logo ── */
    .topnav__logo {
      display: flex;
      align-items: center;
      gap: .45rem;
      padding-inline-end: 1rem;
      border-inline-end: 1px solid rgba(201,168,76,.13);
      margin-inline-end: .4rem;
      text-decoration: none;
      flex-shrink: 0;
      cursor: pointer;
      transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .topnav__logo:hover {
      transform: scale(1.03);
    }

    .logo-mark {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #c9a84c 0%, #e3c76a 100%);
      color: #0b1a12;
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: .92rem;
      letter-spacing: -.02em;
      flex-shrink: 0;
      box-shadow: 0 2px 12px rgba(201,168,76,0.3), 0 0 0 1px rgba(201,168,76,0.2);
      transition: box-shadow 220ms ease, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .topnav__logo:hover .logo-mark {
      box-shadow: 0 4px 18px rgba(201,168,76,0.45), 0 0 0 1px rgba(201,168,76,0.35);
      transform: scale(1.05);
    }

    .logo-text {
      display: flex; flex-direction: column; gap: 0;
    }
    .logo-en {
      font-size: .95rem; font-weight: 800;
      color: #c9a84c; letter-spacing: .1em; line-height: 1.1;
    }
    .logo-ar {
      font-size: .66rem; color: rgba(242,237,228,.32); line-height: 1;
    }

    /* ── Impersonation badge ── */
    .imp-badge {
      display: flex; align-items: center; gap: .4rem;
      background: rgba(201,168,76,.1);
      border: 1px solid rgba(201,168,76,.28);
      border-radius: 6px;
      padding: .2rem .65rem;
      font-size: .72rem;
      color: #c9a84c;
      flex-shrink: 0;
      margin-inline-end: .5rem;
      animation: pulse-border 2s ease infinite;

      button {
        background: none; border: none;
        color: #c9a84c; font-size: .7rem;
        cursor: pointer; padding: 0 .2rem;
        &:hover { text-decoration: underline; }
      }
    }
    .imp-indicator {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #c9a84c;
      animation: pulse-dot 1.5s ease infinite;
      flex-shrink: 0;
    }
    @keyframes pulse-border {
      0%, 100% { box-shadow: 0 0 0 0 rgba(201,168,76,0.4); }
      50%       { box-shadow: 0 0 0 3px rgba(201,168,76,0); }
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    /* ── Nav tabs ── */
    .topnav__tabs {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0;
      overflow-x: auto;
      scrollbar-width: none;
      height: 100%;
    }
    .topnav__tabs::-webkit-scrollbar { display: none; }

    .nav-tab {
      display: flex; align-items: center; gap: .3rem;
      padding: 0 .75rem;
      height: 100%;
      font-size: .8rem; font-weight: 600;
      color: rgba(242,237,228,.42);
      text-decoration: none;
      white-space: nowrap;
      position: relative;
      flex-shrink: 0;
      transition: color 200ms cubic-bezier(0.22,1,0.36,1);
    }

    /* Hover pill behind tab */
    .nav-tab__pill {
      position: absolute;
      inset-block: 10px;
      inset-inline: 4px;
      background: rgba(201,168,76,0.08);
      border-radius: 6px;
      opacity: 0;
      transform: scaleY(0.7);
      transition: opacity 200ms cubic-bezier(0.22,1,0.36,1),
                  transform 200ms cubic-bezier(0.22,1,0.36,1);
      pointer-events: none;
    }

    .nav-tab__label {
      position: relative; z-index: 1;
    }

    /* Active gold underline indicator */
    .nav-tab__indicator {
      position: absolute;
      bottom: 0;
      inset-inline: 8px;
      height: 2px;
      background: linear-gradient(90deg, #c9a84c, #e3c76a);
      border-radius: 2px 2px 0 0;
      opacity: 0;
      transform: scaleX(0);
      transition: opacity 220ms cubic-bezier(0.22,1,0.36,1),
                  transform 220ms cubic-bezier(0.22,1,0.36,1);
      pointer-events: none;
    }

    .nav-tab:hover {
      color: rgba(242,237,228,.82);
      .nav-tab__pill {
        opacity: 1;
        transform: scaleY(1);
      }
    }

    .nav-tab.active {
      color: #c9a84c;
      .nav-tab__indicator {
        opacity: 1;
        transform: scaleX(1);
      }
      .nav-tab__pill {
        opacity: 1;
        transform: scaleY(1);
        background: rgba(201,168,76,0.11);
      }
    }

    /* Tooltip for nav tabs — show alt language label */
    .nav-tab[data-tooltip]::after {
      bottom: auto;
      top: calc(100% + 6px);
      font-size: 10px;
    }
    .nav-tab[data-tooltip]::before {
      bottom: auto;
      top: calc(100% + 1px);
      border-top-color: transparent;
      border-bottom-color: rgba(201,168,76,0.22);
    }

    /* ── Right actions ── */
    .topnav__actions {
      display: flex; align-items: center; gap: .6rem;
      padding-inline-start: .75rem;
      border-inline-start: 1px solid rgba(201,168,76,.1);
      flex-shrink: 0;
    }

    /* ── User chip ── */
    .user-chip {
      display: flex; align-items: center; gap: .4rem;
      cursor: default;
    }
    .user-avatar {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #c9a84c 0%, #e3c76a 100%);
      color: #0b1a12;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: .7rem;
      flex-shrink: 0;
      box-shadow: 0 0 0 2px rgba(201,168,76,0);
      transition: box-shadow 220ms cubic-bezier(0.22,1,0.36,1),
                  transform 220ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .user-chip:hover .user-avatar {
      box-shadow: 0 0 0 2.5px #c9a84c, 0 0 0 4px rgba(201,168,76,0.2);
      transform: scale(1.06);
    }
    .user-name {
      font-size: .78rem; font-weight: 600;
      color: rgba(242,237,228,.6);
      max-width: 120px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* User chip tooltip position */
    .user-chip[data-tooltip]::after {
      bottom: auto;
      top: calc(100% + 6px);
      font-size: 10px;
    }
    .user-chip[data-tooltip]::before {
      bottom: auto;
      top: calc(100% + 1px);
      border-top-color: transparent;
      border-bottom-color: rgba(201,168,76,0.22);
    }

    /* ── Logout button ── */
    .logout-btn {
      background: none; border: none;
      color: rgba(242,237,228,.3);
      padding: .35rem;
      border-radius: 6px;
      display: flex; align-items: center;
      cursor: pointer;
      transition: color 200ms cubic-bezier(0.22,1,0.36,1),
                  background 200ms cubic-bezier(0.22,1,0.36,1),
                  transform 200ms cubic-bezier(0.22,1,0.36,1);
      position: relative;
    }
    .logout-btn:hover {
      color: #f87171;
      background: rgba(248,113,113,.1);
      transform: scale(1.1);
    }

    /* Logout tooltip — show above */
    .logout-btn[data-tooltip]::after {
      bottom: auto;
      top: calc(100% + 6px);
      white-space: nowrap;
    }
    .logout-btn[data-tooltip]::before {
      bottom: auto;
      top: calc(100% + 1px);
      border-top-color: transparent;
      border-bottom-color: rgba(201,168,76,0.22);
    }

    /* ── Lang toggle tooltip ── */
    .lang-toggle[data-tooltip]::after {
      bottom: auto;
      top: calc(100% + 6px);
    }
    .lang-toggle[data-tooltip]::before {
      bottom: auto;
      top: calc(100% + 1px);
      border-top-color: transparent;
      border-bottom-color: rgba(201,168,76,0.22);
    }

    @media (max-width: 768px) {
      .user-name { display: none; }
      .logo-ar { display: none; }
    }
  `]
})
export class TopnavComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);

  private allItems: NavItem[] = [
    { labelAr: 'نظرة عامة',         labelEn: 'Overview',          route: '/dashboard/overview',          roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER','BRANCH_EMPLOYEE','DATA_ENTRY'] },
    { labelAr: 'الفروع',             labelEn: 'Branches',          route: '/dashboard/branches',          roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
    { labelAr: 'المناطق',            labelEn: 'Regions',           route: '/dashboard/regions',           roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER'] },
    { labelAr: 'الموظفون',           labelEn: 'Employees',         route: '/dashboard/employees',         roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
    { labelAr: 'عيارات الذهب',       labelEn: 'Karat',             route: '/dashboard/karat',             roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
    { labelAr: 'موطن الذهب',         labelEn: 'Mothan',            route: '/dashboard/mothan',            roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'الخارطة الحرارية',   labelEn: 'Heatmap',           route: '/dashboard/heatmap',           roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'مقارنة الأيام',      labelEn: 'Comparison',        route: '/dashboard/comparison',        roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'الأهداف',            labelEn: 'Targets',           route: '/dashboard/targets',           roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'رفع الملفات',        labelEn: 'Upload',            route: '/upload',                      roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','DATA_ENTRY'] },
    { labelAr: 'المستخدمون',         labelEn: 'Users',             route: '/users',                       roles: ['COMPANY_ADMIN'] },
    { labelAr: 'أسعار الشراء',       labelEn: 'Rates',             route: '/dashboard/rates',             roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'أدائي',              labelEn: 'My Performance',    route: '/dashboard/my-performance',    roles: ['BRANCH_EMPLOYEE'] },
    { labelAr: 'داشبورد 3.0',        labelEn: 'Dashboard 3.0',     route: '/v3',                          roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'],  badge: 'v3' },
    { labelAr: 'لوحة التحكم',        labelEn: 'Dashboard',         route: '/super-admin/dashboard',       roles: ['SUPER_ADMIN'] },
    { labelAr: 'الشركات',            labelEn: 'Companies',         route: '/super-admin/tenants',         roles: ['SUPER_ADMIN'] },
    { labelAr: 'خطط الاشتراك',       labelEn: 'Tiers',             route: '/super-admin/tiers',           roles: ['SUPER_ADMIN'] },
  ];

  visibleItems = computed(() => {
    const role = this.auth.currentUserSignal()?.role;
    if (!role) return [];
    return this.allItems.filter(i => !i.roles || i.roles.includes(role));
  });

  initials = computed(() => {
    const name = this.auth.currentUserSignal()?.fullName || '';
    return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  });

  logoRoute = computed(() =>
    this.auth.currentUserSignal()?.role === 'SUPER_ADMIN'
      ? '/super-admin/dashboard'
      : '/dashboard/overview'
  );
}
