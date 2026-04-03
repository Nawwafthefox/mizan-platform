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
      <a routerLink="/v3/overview" class="topnav__logo" dir="ltr">
        <span class="logo-mark">M</span>
        <span class="logo-en">MIZAN</span>
        <span class="logo-ar">ميزان</span>
      </a>

      @if (auth.impersonating()) {
        <div class="imp-badge">
          <span>👁 {{ auth.impersonating() }}</span>
          <button (click)="auth.endImpersonation()">خروج</button>
        </div>
      }

      <!-- Nav tabs -->
      <div class="topnav__tabs">
        @for (item of visibleItems(); track item.route) {
          <a [routerLink]="item.route" routerLinkActive="active"
             class="nav-tab" [class.studio-nav-link]="item.badge">
            {{ i18n.isAr() ? item.labelAr : item.labelEn }}
            @if (item.badge) {
              <span class="studio-2-badge">{{ item.badge }}</span>
            }
          </a>
        }
      </div>

      <!-- Right actions -->
      <div class="topnav__actions">
        <div class="lang-toggle lang-toggle--light" (click)="i18n.toggle()" title="Switch Language">
          <span [class.active]="i18n.isAr()">AR</span>
          <span [class.active]="!i18n.isAr()">EN</span>
        </div>
        <div class="user-chip">
          <div class="user-avatar">{{ initials() }}</div>
          <span class="user-name">{{ auth.currentUserSignal()?.fullName }}</span>
        </div>
        <button class="logout-btn" (click)="auth.logout()"
                [title]="i18n.isAr() ? 'تسجيل الخروج' : 'Sign Out'">
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
      background: #0b1a12;
      border-bottom: 1px solid rgba(201,168,76,.16);
      display: flex;
      align-items: center;
      gap: 0;
      z-index: 200;
      padding: 0 1rem;
      box-shadow: 0 2px 24px rgba(0,0,0,.45);
    }

    .topnav__logo {
      display: flex;
      align-items: center;
      gap: .4rem;
      padding-inline-end: 1rem;
      border-inline-end: 1px solid rgba(201,168,76,.15);
      margin-inline-end: .4rem;
      text-decoration: none;
      flex-shrink: 0;
      cursor: pointer;
    }
    .logo-mark {
      width: 28px; height: 28px;
      background: #c9a84c;
      color: #0b1a12;
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: .92rem;
      letter-spacing: -.02em;
      flex-shrink: 0;
    }
    .logo-en {
      font-size: .95rem; font-weight: 800;
      color: #c9a84c;
      letter-spacing: .1em;
    }
    .logo-ar {
      font-size: .7rem;
      color: rgba(242,237,228,.35);
    }

    .imp-badge {
      display: flex; align-items: center; gap: .4rem;
      background: rgba(201,168,76,.13);
      border: 1px solid rgba(201,168,76,.28);
      border-radius: 6px;
      padding: .2rem .65rem;
      font-size: .72rem;
      color: #c9a84c;
      flex-shrink: 0;
      margin-inline-end: .5rem;
      button {
        background: none; border: none;
        color: #c9a84c; font-size: .7rem;
        cursor: pointer; padding: 0 .2rem;
        &:hover { text-decoration: underline; }
      }
    }

    .topnav__tabs {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0;
      overflow-x: auto;
      scrollbar-width: none;
      height: 100%;
      &::-webkit-scrollbar { display: none; }
    }

    .nav-tab {
      display: flex; align-items: center; gap: .3rem;
      padding: 0 .75rem;
      height: 100%;
      font-size: .8rem; font-weight: 600;
      color: rgba(242,237,228,.45);
      text-decoration: none;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: color .15s, border-color .15s;
      flex-shrink: 0;

      &:hover { color: rgba(242,237,228,.82); }
      &.active {
        color: #c9a84c;
        border-bottom-color: #c9a84c;
      }
    }

    .topnav__actions {
      display: flex; align-items: center; gap: .6rem;
      padding-inline-start: .75rem;
      border-inline-start: 1px solid rgba(201,168,76,.12);
      flex-shrink: 0;
    }

    .user-chip {
      display: flex; align-items: center; gap: .4rem;
    }
    .user-avatar {
      width: 30px; height: 30px;
      background: #c9a84c;
      color: #0b1a12;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: .7rem;
      flex-shrink: 0;
    }
    .user-name {
      font-size: .78rem; font-weight: 600;
      color: rgba(242,237,228,.65);
      max-width: 120px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    @media (max-width: 768px) {
      .user-name { display: none; }
      .logo-ar { display: none; }
    }

    .logout-btn {
      background: none; border: none;
      color: rgba(242,237,228,.32);
      padding: .35rem;
      border-radius: 6px;
      display: flex; align-items: center;
      cursor: pointer;
      transition: color .15s, background .15s;
      &:hover { color: #f87171; background: rgba(248,113,113,.1); }
    }
  `]
})
export class TopnavComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);

  private allItems: NavItem[] = [
    { labelAr: 'نظرة عامة',         labelEn: 'Overview',          route: '/v3/overview',                roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER','BRANCH_EMPLOYEE','DATA_ENTRY'] },
    { labelAr: 'الفروع',             labelEn: 'Branches',          route: '/v3/branches',                roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
    { labelAr: 'المناطق',            labelEn: 'Regions',           route: '/v3/regions',                 roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER'] },
    { labelAr: 'الموظفون',           labelEn: 'Employees',         route: '/v3/employees',               roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
    { labelAr: 'عيارات الذهب',       labelEn: 'Karat',             route: '/v3/karat',                   roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
    { labelAr: 'موطن الذهب',         labelEn: 'Mothan',            route: '/v3/mothan',                  roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'الخارطة الحرارية',   labelEn: 'Heatmap',           route: '/v3/heatmap',                 roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'مقارنة الأيام',      labelEn: 'Comparison',        route: '/v3/comparison',              roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'الأهداف',            labelEn: 'Targets',           route: '/v3/targets',                 roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'رفع الملفات',        labelEn: 'Upload',            route: '/upload',                     roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','DATA_ENTRY'] },
    { labelAr: 'المستخدمون',         labelEn: 'Users',             route: '/users',                      roles: ['COMPANY_ADMIN'] },
    { labelAr: 'أسعار الشراء',       labelEn: 'Rates',             route: '/dashboard/rates',            roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
    { labelAr: 'أدائي',              labelEn: 'My Performance',    route: '/dashboard/my-performance',   roles: ['BRANCH_EMPLOYEE'] },
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
}
