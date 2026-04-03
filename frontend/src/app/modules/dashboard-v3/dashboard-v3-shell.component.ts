import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { V3DateRangeService } from './services/v3-date-range.service';

interface V3Tab {
  label: string;
  path: string;
  premium?: boolean;
  upload?: boolean;
  back?: boolean;
}

@Component({
  selector: 'app-dashboard-v3-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <div class="v3-shell" dir="rtl">

      <!-- Top nav tabs -->
      <nav class="v3-topnav" role="navigation" aria-label="V3 Dashboard Navigation">
        <div class="v3-topnav-inner">
          @for (tab of tabs; track tab.path) {
            @if (tab.back) {
              <a
                [routerLink]="tab.path"
                class="v3-tab back-tab"
                title="العودة إلى الداشبورد الكلاسيكي"
              >
                {{ tab.label }}
              </a>
              <div class="tab-divider"></div>
            } @else {
              <a
                [routerLink]="tab.path"
                routerLinkActive="active"
                class="v3-tab"
                [class.premium-tab]="tab.premium"
                [class.upload-tab]="tab.upload"
              >
                {{ tab.label }}
              </a>
            }
          }
        </div>
      </nav>

      <!-- Date filter bar -->
      <div class="v3-date-bar">
        <div class="v3-date-bar-inner">

          <div class="date-inputs">
            <label class="date-field">
              <span class="date-field-label">من</span>
              <input
                type="date"
                class="date-input"
                [value]="dateRange.from()"
                (change)="onFromChange($event)"
              />
            </label>
            <span class="date-sep">—</span>
            <label class="date-field">
              <span class="date-field-label">إلى</span>
              <input
                type="date"
                class="date-input"
                [value]="dateRange.to()"
                (change)="onToChange($event)"
              />
            </label>
          </div>

          <div class="date-presets">
            <button class="preset-btn" (click)="dateRange.setToday()">اليوم</button>
            <button class="preset-btn" (click)="dateRange.setLastDays(7)">7 أيام</button>
            <button class="preset-btn" (click)="dateRange.setLastDays(30)">30 يوماً</button>
            <button class="preset-btn" (click)="dateRange.setCurrentMonth()">هذا الشهر</button>
            <button class="preset-btn" (click)="dateRange.setLastMonth()">الشهر الماضي</button>
          </div>

        </div>
      </div>

      <!-- Page content -->
      <main class="v3-content">
        <router-outlet />
      </main>

    </div>
  `,
  styles: [`
    :host { display: block; }

    .v3-shell {
      min-height: 100vh;
      background: var(--mizan-bg, #0f1a14);
      color: var(--mizan-text, #e8e8e8);
      padding-top: 56px; /* account for main app topnav */
      direction: rtl;
    }

    /* ── Top Nav ── */
    .v3-topnav {
      position: sticky;
      top: 56px;
      z-index: 100;
      background: var(--mizan-surface, #1a2a1f);
      border-bottom: 1px solid var(--mizan-border, rgba(255,255,255,.08));
      box-shadow: 0 2px 12px rgba(0,0,0,.3);
    }

    .v3-topnav-inner {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding: 0 1rem;
      gap: 0;
    }

    .v3-topnav-inner::-webkit-scrollbar {
      display: none;
    }

    .v3-tab {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      padding: .75rem 1.1rem;
      font-size: .875rem;
      font-weight: 500;
      color: var(--mizan-text-muted, #8a9a8f);
      text-decoration: none;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: color .2s ease, border-color .2s ease;
      cursor: pointer;
      position: relative;
    }

    .v3-tab:hover {
      color: var(--mizan-text, #e8e8e8);
    }

    .v3-tab.active {
      color: var(--mizan-gold, #c9a84c);
      border-bottom-color: var(--mizan-gold, #c9a84c);
    }

    /* Premium tab special styling */
    .v3-tab.premium-tab {
      color: var(--mizan-gold, #c9a84c);
      background: linear-gradient(
        135deg,
        rgba(201,168,76,.08) 0%,
        rgba(201,168,76,.03) 100%
      );
      border-radius: 6px 6px 0 0;
      margin-top: 4px;
      padding-bottom: calc(.75rem - 4px);
    }

    .v3-tab.premium-tab::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 6px 6px 0 0;
      box-shadow:
        0 0 0 1px rgba(201,168,76,.25),
        0 -2px 12px rgba(201,168,76,.15) inset;
      pointer-events: none;
    }

    .v3-tab.premium-tab.active {
      background: linear-gradient(
        135deg,
        rgba(201,168,76,.18) 0%,
        rgba(201,168,76,.06) 100%
      );
      border-bottom-color: var(--mizan-gold, #c9a84c);
      text-shadow: 0 0 12px rgba(201,168,76,.5);
    }

    /* Back-to-classic tab */
    .v3-tab.back-tab {
      color: rgba(138,154,143,.55);
      font-size: .8rem;
      letter-spacing: .02em;
      padding-right: .75rem;
      padding-left: .75rem;
      border-bottom-color: transparent !important;
    }
    .v3-tab.back-tab:hover {
      color: rgba(138,154,143,.9);
      background: rgba(255,255,255,.04);
      border-radius: 6px 6px 0 0;
    }

    /* Vertical divider between back tab and v3 tabs */
    .tab-divider {
      width: 1px;
      height: 22px;
      background: var(--mizan-border, rgba(255,255,255,.1));
      align-self: center;
      flex-shrink: 0;
      margin: 0 .25rem;
    }

    /* Upload tab styling */
    .v3-tab.upload-tab {
      color: rgba(100,180,255,.65);
    }
    .v3-tab.upload-tab:hover {
      color: rgba(100,180,255,.9);
      background: rgba(100,180,255,.07);
    }
    .v3-tab.upload-tab.active {
      color: #64b4ff;
      border-bottom-color: #64b4ff;
    }

    /* ── Date Filter Bar ── */
    .v3-date-bar {
      background: var(--mizan-surface, #1a2a1f);
      border-bottom: 1px solid var(--mizan-border, rgba(255,255,255,.08));
      padding: .5rem 1.5rem;
    }

    .v3-date-bar-inner {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      flex-wrap: wrap;
      max-width: 1400px;
      margin: 0 auto;
    }

    .date-inputs {
      display: flex;
      align-items: center;
      gap: .5rem;
    }

    .date-field {
      display: flex;
      align-items: center;
      gap: .4rem;
    }

    .date-field-label {
      font-size: .75rem;
      color: var(--mizan-text-muted, #8a9a8f);
      font-weight: 500;
      white-space: nowrap;
    }

    .date-input {
      background: rgba(255,255,255,.05);
      border: 1px solid var(--mizan-border, rgba(255,255,255,.08));
      border-radius: 6px;
      color: var(--mizan-text, #e8e8e8);
      padding: .3rem .55rem;
      font-size: .8rem;
      outline: none;
      transition: border-color .2s ease;
      color-scheme: dark;
    }

    .date-input:focus {
      border-color: var(--mizan-gold, #c9a84c);
      box-shadow: 0 0 0 2px rgba(201,168,76,.15);
    }

    .date-sep {
      color: var(--mizan-text-muted, #8a9a8f);
      font-size: .85rem;
    }

    .date-presets {
      display: flex;
      align-items: center;
      gap: .4rem;
      flex-wrap: wrap;
    }

    .preset-btn {
      background: rgba(255,255,255,.04);
      border: 1px solid var(--mizan-border, rgba(255,255,255,.08));
      border-radius: 20px;
      color: var(--mizan-text-muted, #8a9a8f);
      padding: .25rem .75rem;
      font-size: .78rem;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background .2s ease, color .2s ease, border-color .2s ease;
      font-family: inherit;
    }

    .preset-btn:hover {
      background: rgba(201,168,76,.12);
      border-color: rgba(201,168,76,.3);
      color: var(--mizan-gold, #c9a84c);
    }

    .preset-btn:active {
      background: rgba(201,168,76,.2);
    }

    /* ── Content area ── */
    .v3-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.75rem 1.75rem 3rem;
    }

    @media (max-width: 768px) {
      .v3-shell {
        padding-top: 56px;
      }
      .v3-date-bar {
        padding: .5rem 1rem;
      }
      .v3-date-bar-inner {
        gap: .75rem;
      }
      .v3-content {
        padding: 1rem 1rem 2.5rem;
      }
      .date-inputs {
        gap: .35rem;
      }
    }
  `]
})
export class DashboardV3ShellComponent implements OnInit {
  dateRange = inject(V3DateRangeService);
  private router = inject(Router);

  tabs: V3Tab[] = [
    { label: '← الكلاسيكي',  path: '/dashboard/overview', back: true },
    { label: 'نظرة عامة',    path: '/v3/overview' },
    { label: 'رفع الملفات',  path: '/v3/upload', upload: true },
    { label: 'التنبيهات',    path: '/v3/alerts' },
    { label: 'الفروع',       path: '/v3/branches' },
    { label: 'المناطق',      path: '/v3/regions' },
    { label: 'الموظفون',     path: '/v3/employees' },
    { label: 'العيار',       path: '/v3/karat' },
    { label: 'موطن الذهب',   path: '/v3/mothan' },
    { label: 'الخارطة',      path: '/v3/heatmap' },
    { label: 'مقارنة',       path: '/v3/comparison' },
    { label: 'الأهداف',      path: '/v3/targets' },
    { label: '⭐ بريميوم',   path: '/v3/premium', premium: true },
  ];

  ngOnInit(): void {
    // Service constructor already sets defaults; nothing extra needed.
  }

  onFromChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.dateRange.setRange(input.value, this.dateRange.to());
    }
  }

  onToChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.dateRange.setRange(this.dateRange.from(), input.value);
    }
  }
}
