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
                data-tooltip="العودة للداشبورد الكلاسيكي"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="back-arrow">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                <span>{{ tab.label }}</span>
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
                <span class="v3-tab__pill"></span>
                <span class="v3-tab__label">{{ tab.label }}</span>
                @if (tab.premium) {
                  <span class="premium-glow-ring"></span>
                }
                <span class="v3-tab__bar"></span>
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
      padding-top: 56px;
      direction: rtl;
    }

    /* ── Top Nav ── */
    .v3-topnav {
      position: sticky;
      top: 56px;
      z-index: 100;
      background: rgba(20, 35, 25, 0.94);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(201,168,76,0.1);
      box-shadow: 0 2px 16px rgba(0,0,0,.35);
    }

    .v3-topnav-inner {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding: 0 1rem;
      gap: 0;
    }
    .v3-topnav-inner::-webkit-scrollbar { display: none; }

    /* ── Tab base ── */
    .v3-tab {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: .3rem;
      padding: 0 .9rem;
      height: 42px;
      font-size: .82rem;
      font-weight: 600;
      color: rgba(232,228,220,.42);
      text-decoration: none;
      white-space: nowrap;
      position: relative;
      cursor: pointer;
      transition: color 200ms cubic-bezier(0.22,1,0.36,1);
    }

    .v3-tab__pill {
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

    .v3-tab__label {
      position: relative; z-index: 1;
    }

    .v3-tab__bar {
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

    .v3-tab:hover {
      color: rgba(232,228,220,.82);
      .v3-tab__pill { opacity: 1; transform: scaleY(1); }
    }

    .v3-tab.active {
      color: #c9a84c;
      .v3-tab__pill { opacity: 1; transform: scaleY(1); background: rgba(201,168,76,0.11); }
      .v3-tab__bar { opacity: 1; transform: scaleX(1); }
    }

    /* Premium tab */
    .v3-tab.premium-tab {
      color: #c9a84c;
    }

    .premium-glow-ring {
      position: absolute;
      inset: 4px 2px;
      border-radius: 6px;
      pointer-events: none;
      animation: premiumPulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite;
      z-index: 0;
    }

    @keyframes premiumPulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(201,168,76,0.3),
                    inset 0 0 8px rgba(201,168,76,0.08);
      }
      50% {
        box-shadow: 0 0 0 3px rgba(201,168,76,0),
                    inset 0 0 12px rgba(201,168,76,0.15);
      }
    }

    .v3-tab.premium-tab .v3-tab__pill {
      background: rgba(201,168,76,0.1);
      opacity: 1;
      transform: scaleY(1);
      box-shadow: inset 0 0 0 1px rgba(201,168,76,0.2);
    }

    .v3-tab.premium-tab.active {
      text-shadow: 0 0 16px rgba(201,168,76,0.5);
      .v3-tab__bar { opacity: 1; transform: scaleX(1); }
    }

    /* Back tab */
    .v3-tab.back-tab {
      color: rgba(200,210,205,.38);
      font-size: .78rem;
      letter-spacing: .01em;
      gap: .25rem;
    }
    .back-arrow {
      flex-shrink: 0;
      opacity: 0.7;
      transition: transform 200ms cubic-bezier(0.22,1,0.36,1),
                  opacity 200ms ease;
    }
    .v3-tab.back-tab:hover {
      color: rgba(200,210,205,.75);
      .back-arrow { transform: translateX(2px); opacity: 1; }
    }

    /* Back tab tooltip */
    .back-tab[data-tooltip]::after {
      bottom: auto;
      top: calc(100% + 6px);
      font-size: 10.5px;
    }
    .back-tab[data-tooltip]::before {
      bottom: auto;
      top: calc(100% + 1px);
      border-top-color: transparent;
      border-bottom-color: rgba(201,168,76,0.22);
    }

    /* Upload tab */
    .v3-tab.upload-tab { color: rgba(100,180,255,.6); }
    .v3-tab.upload-tab:hover { color: rgba(100,180,255,.9); }
    .v3-tab.upload-tab.active {
      color: #64b4ff;
      .v3-tab__bar { background: linear-gradient(90deg, #64b4ff, #93c5fd); }
    }

    /* Tab divider */
    .tab-divider {
      width: 1px;
      height: 20px;
      background: rgba(201,168,76,0.12);
      align-self: center;
      flex-shrink: 0;
      margin: 0 .2rem;
    }

    /* ── Date Filter Bar ── */
    .v3-date-bar {
      background: rgba(18, 30, 22, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(201,168,76,0.08);
      padding: .55rem 1.5rem;
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
      font-size: .72rem;
      color: rgba(232,228,220,.4);
      font-weight: 600;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .date-input {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(201,168,76,0.1);
      border-radius: 7px;
      color: rgba(232,228,220,.85);
      padding: .32rem .6rem;
      font-size: .8rem;
      outline: none;
      transition: border-color 200ms cubic-bezier(0.22,1,0.36,1),
                  box-shadow 200ms cubic-bezier(0.22,1,0.36,1),
                  background 200ms ease;
      color-scheme: dark;
      font-family: inherit;

      &:focus {
        border-color: rgba(201,168,76,0.45);
        box-shadow: 0 0 0 3px rgba(201,168,76,.1);
        background: rgba(255,255,255,.06);
      }
    }

    .date-sep {
      color: rgba(232,228,220,.2);
      font-size: .85rem;
    }

    .date-presets {
      display: flex;
      align-items: center;
      gap: .35rem;
      flex-wrap: wrap;
    }

    .preset-btn {
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(201,168,76,0.1);
      border-radius: 20px;
      color: rgba(232,228,220,.45);
      padding: .26rem .7rem;
      font-size: .76rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
      transition: background 200ms cubic-bezier(0.22,1,0.36,1),
                  color 200ms cubic-bezier(0.22,1,0.36,1),
                  border-color 200ms cubic-bezier(0.22,1,0.36,1),
                  transform 200ms cubic-bezier(0.22,1,0.36,1);

      &:hover {
        background: rgba(201,168,76,0.12);
        border-color: rgba(201,168,76,0.35);
        color: #c9a84c;
        transform: translateY(-1px);
      }

      &:active {
        background: rgba(201,168,76,0.2);
        transform: translateY(0);
      }
    }

    /* ── Content area ── */
    .v3-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.75rem 1.75rem 3rem;
    }

    @media (max-width: 768px) {
      .v3-shell { padding-top: 56px; }
      .v3-date-bar { padding: .5rem 1rem; }
      .v3-date-bar-inner { gap: .75rem; }
      .v3-content { padding: 1rem 1rem 2.5rem; }
      .date-inputs { gap: .35rem; }
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
