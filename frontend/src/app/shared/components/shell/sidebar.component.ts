import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';

interface NavItem {
  label: string;
  labelAr: string;
  icon: string;
  route: string;
  roles?: string[];
}

interface NavSection {
  sectionLabel?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <div class="sidebar__logo">
        <span class="logo-en">MIZAN</span>
        <span class="logo-ar">ميزان</span>
      </div>

      @if (auth.impersonating()) {
        <div class="impersonating-banner">
          <span>👁 {{ auth.impersonating() }}</span>
          <button (click)="auth.endImpersonation()" class="exit-imp">خروج</button>
        </div>
      }

      <nav class="sidebar__nav">
        @for (section of visibleSections(); track section.sectionLabel ?? 'main') {
          @if (section.sectionLabel) {
            <div class="nav-section-label">{{ section.sectionLabel }}</div>
          }
          @for (item of section.items; track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active"
               class="nav-item" [class.studio-nav-link]="item.route === '/dashboard/analytics-studio'"
               [title]="item.labelAr">
              <span class="nav-label">{{ item.labelAr }}</span>
              @if (item.route === '/dashboard/analytics-studio') {
                <span class="studio-2-badge">2.0</span>
              }
            </a>
          }
        }
      </nav>

      <div class="sidebar__footer">
        <div class="user-info">
          <div class="user-avatar">{{ initials() }}</div>
          <div>
            <div class="user-name">{{ auth.currentUserSignal()?.fullName }}</div>
            <div class="user-role">{{ roleLabel() }}</div>
          </div>
        </div>
        <div class="footer-actions">
          <div class="lang-toggle lang-toggle--light" (click)="i18n.toggle()" title="Switch Language">
            <span [class.active]="i18n.isAr()">AR</span>
            <span [class.active]="!i18n.isAr()">EN</span>
          </div>
          <button class="logout-btn" (click)="auth.logout()" [title]="i18n.isAr() ? 'تسجيل الخروج' : 'Sign Out'">⬡</button>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: var(--sidebar-w);
      height: 100vh;
      background: var(--mizan-green-dark);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0;
      z-index: 100;
      overflow-y: auto;
    }

    .sidebar__logo {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgba(255,255,255,.1);
      display: flex;
      align-items: baseline;
      gap: .5rem;
    }
    .logo-en {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--mizan-gold);
      letter-spacing: .1em;
    }
    .logo-ar {
      font-size: .9rem;
      color: rgba(255,255,255,.6);
    }

    .impersonating-banner {
      background: rgba(201,168,76,.2);
      border-bottom: 1px solid rgba(201,168,76,.3);
      padding: .5rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: .78rem;
      color: var(--mizan-gold-light);
    }
    .exit-imp {
      background: none; border: 1px solid var(--mizan-gold);
      color: var(--mizan-gold); border-radius: 4px;
      padding: .15rem .5rem; font-size: .72rem; cursor: pointer;
    }
    .exit-imp:hover { background: var(--mizan-gold); color: var(--mizan-green-dark); }

    .sidebar__nav {
      flex: 1;
      padding: .75rem 0;
      display: flex;
      flex-direction: column;
    }

    .nav-section-label {
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .08em;
      color: rgba(255,255,255,.3);
      padding: .9rem 1.5rem .3rem;
      text-transform: uppercase;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: .75rem;
      padding: .7rem 1.5rem;
      color: rgba(255,255,255,.7);
      transition: all .2s;
      font-size: .9rem;
      border-inline-start: 3px solid transparent;
      text-decoration: none;
    }
    .nav-item:hover { background: rgba(255,255,255,.07); color: #fff; }
    .nav-item.active {
      background: rgba(201,168,76,.15);
      color: var(--mizan-gold);
      border-inline-start-color: var(--mizan-gold);
    }

    .nav-label { flex: 1; }

    .sidebar__footer {
      padding: 1rem 1.25rem;
      border-top: 1px solid rgba(255,255,255,.1);
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-wrap: wrap;
    }
    .footer-actions {
      display: flex; align-items: center; gap: .5rem;
    }
    .user-info { flex: 1; display: flex; align-items: center; gap: .6rem; overflow: hidden; }
    .user-avatar {
      width: 34px; height: 34px;
      background: var(--mizan-gold);
      color: var(--mizan-green-dark);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: .8rem;
      flex-shrink: 0;
    }
    .user-name { font-size: .82rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { font-size: .72rem; color: rgba(255,255,255,.5); }
    .logout-btn {
      background: none; border: none;
      color: rgba(255,255,255,.45); font-size: 1.1rem;
      padding: .35rem;
      border-radius: 6px;
      cursor: pointer;
    }
    .logout-btn:hover { color: var(--mizan-danger); background: rgba(220,53,69,.1); }
  `]
})
export class SidebarComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);

  private navSections: NavSection[] = [
    {
      items: [
        { label: 'Overview', labelAr: 'نظرة عامة', icon: '◈', route: '/dashboard/overview', roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER','BRANCH_EMPLOYEE','DATA_ENTRY'] },
      ]
    },
    {
      sectionLabel: 'التحليلات',
      items: [
        { label: 'Branches',   labelAr: 'الفروع',             icon: '', route: '/dashboard/branches',   roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
        { label: 'Regions',    labelAr: 'المناطق',            icon: '', route: '/dashboard/regions',    roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER'] },
        { label: 'Employees',  labelAr: 'الموظفون',           icon: '', route: '/dashboard/employees',  roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
        { label: 'Karat',      labelAr: 'عيارات الذهب',       icon: '', route: '/dashboard/karat',      roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','REGION_MANAGER','BRANCH_MANAGER'] },
        { label: 'Mothan',     labelAr: 'موطن الذهب',         icon: '', route: '/dashboard/mothan',     roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
        { label: 'Heatmap',    labelAr: 'الخارطة الحرارية',   icon: '', route: '/dashboard/heatmap',    roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
        { label: 'Comparison', labelAr: 'مقارنة الأيام',      icon: '', route: '/dashboard/comparison', roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
        { label: 'Analytics Studio', labelAr: 'استوديو التحليلات', icon: '✦', route: '/dashboard/analytics-studio', roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
      ]
    },
    {
      sectionLabel: 'الإدارة',
      items: [
        { label: 'Upload', labelAr: 'رفع الملفات',  icon: '', route: '/upload',          roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN','DATA_ENTRY'] },
        { label: 'Users',  labelAr: 'المستخدمون',   icon: '', route: '/users',           roles: ['COMPANY_ADMIN'] },
        { label: 'Rates',  labelAr: 'أسعار الشراء', icon: '', route: '/dashboard/rates', roles: ['CEO','HEAD_OF_SALES','COMPANY_ADMIN'] },
      ]
    },
    {
      sectionLabel: 'أدائي',
      items: [
        { label: 'My Performance', labelAr: 'أدائي', icon: '', route: '/dashboard/my-performance', roles: ['BRANCH_EMPLOYEE'] },
      ]
    },
  ];

  visibleSections = computed(() => {
    const role = this.auth.currentUserSignal()?.role;
    if (!role) return [];
    return this.navSections
      .map(s => ({ ...s, items: s.items.filter(i => !i.roles || i.roles.includes(role)) }))
      .filter(s => s.items.length > 0);
  });

  initials = computed(() => {
    const name = this.auth.currentUserSignal()?.fullName || '';
    return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  });

  roleLabel(): string {
    const map: Record<string, string> = {
      SUPER_ADMIN: 'مدير النظام',
      COMPANY_ADMIN: 'مدير الشركة',
      CEO: 'الرئيس التنفيذي',
      HEAD_OF_SALES: 'رئيس المبيعات',
      REGION_MANAGER: 'مدير المنطقة',
      BRANCH_MANAGER: 'مدير الفرع',
      BRANCH_EMPLOYEE: 'موظف',
      DATA_ENTRY: 'إدخال البيانات',
    };
    return map[this.auth.currentUserSignal()?.role || ''] || '';
  }
}
