import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'v3-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="kpi-card"
      [class.color-gold]="color === 'gold' || !color"
      [class.color-green]="color === 'green'"
      [class.color-red]="color === 'red'"
      [class.color-blue]="color === 'blue'"
      [class.is-loading]="loading"
      [attr.data-tooltip]="tooltip || null"
      dir="rtl"
    >
      <!-- Corner glow accent -->
      <div class="kpi-corner"></div>

      @if (loading) {
        <div class="skeleton skeleton-label"></div>
        <div class="skeleton skeleton-value"></div>
        <div class="skeleton skeleton-subtitle"></div>
      } @else {
        @if (icon) {
          <div class="kpi-icon" [class]="'icon-' + (color || 'gold')">
            <span class="kpi-icon-inner">{{ icon }}</span>
          </div>
        }
        <div class="kpi-label">{{ label }}</div>
        <div class="kpi-value" [class]="'value-' + (color || 'gold')">
          {{ formattedValue }}
        </div>
        @if (subtitle) {
          <div class="kpi-subtitle">{{ subtitle }}</div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .kpi-card {
      background: var(--mizan-surface, #1b3427);
      border: 1px solid var(--mizan-border, rgba(201,168,76,.14));
      border-radius: 14px;
      padding: 1.15rem 1.3rem;
      display: flex;
      flex-direction: column;
      gap: .3rem;
      position: relative;
      overflow: hidden;
      cursor: default;
      transition:
        border-color  220ms cubic-bezier(0.22,1,0.36,1),
        box-shadow    220ms cubic-bezier(0.22,1,0.36,1),
        transform     220ms cubic-bezier(0.22,1,0.36,1),
        background    220ms cubic-bezier(0.22,1,0.36,1);
    }

    /* Colored border tints */
    .kpi-card.color-gold  { border-color: rgba(201,168,76,.22); }
    .kpi-card.color-green { border-color: rgba(52,211,153,.2);  }
    .kpi-card.color-red   { border-color: rgba(248,113,113,.2); }
    .kpi-card.color-blue  { border-color: rgba(100,180,255,.2); }

    /* Hover lift */
    .kpi-card:hover {
      transform: translateY(-3px);
    }
    .kpi-card.color-gold:hover  { border-color: rgba(201,168,76,.55); box-shadow: 0 8px 32px rgba(0,0,0,.3), 0 0 0 1px rgba(201,168,76,.18), 0 4px 16px rgba(201,168,76,.12); }
    .kpi-card.color-green:hover { border-color: rgba(52,211,153,.5);  box-shadow: 0 8px 32px rgba(0,0,0,.3), 0 0 0 1px rgba(52,211,153,.15),  0 4px 16px rgba(52,211,153,.1); }
    .kpi-card.color-red:hover   { border-color: rgba(248,113,113,.5); box-shadow: 0 8px 32px rgba(0,0,0,.3), 0 0 0 1px rgba(248,113,113,.15), 0 4px 16px rgba(248,113,113,.1); }
    .kpi-card.color-blue:hover  { border-color: rgba(100,180,255,.5); box-shadow: 0 8px 32px rgba(0,0,0,.3), 0 0 0 1px rgba(100,180,255,.15), 0 4px 16px rgba(100,180,255,.1); }

    /* Corner gradient glow (decorative) */
    .kpi-corner {
      position: absolute;
      top: 0; inset-inline-start: 0;
      width: 60px; height: 60px;
      border-radius: 0 0 60px 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 220ms cubic-bezier(0.22,1,0.36,1);
    }
    .kpi-card.color-gold  .kpi-corner { background: radial-gradient(circle at 0 0, rgba(201,168,76,.18), transparent 70%); }
    .kpi-card.color-green .kpi-corner { background: radial-gradient(circle at 0 0, rgba(52,211,153,.15), transparent 70%); }
    .kpi-card.color-red   .kpi-corner { background: radial-gradient(circle at 0 0, rgba(248,113,113,.15), transparent 70%); }
    .kpi-card.color-blue  .kpi-corner { background: radial-gradient(circle at 0 0, rgba(100,180,255,.15), transparent 70%); }
    .kpi-card:hover .kpi-corner { opacity: 1; }

    /* Icon */
    .kpi-icon {
      width: 2.2rem; height: 2.2rem;
      display: flex; align-items: center; justify-content: center;
      border-radius: 9px;
      margin-bottom: .15rem;
      transition: transform 220ms cubic-bezier(0.22,1,0.36,1),
                  box-shadow 220ms cubic-bezier(0.22,1,0.36,1);
      position: relative; z-index: 1;
    }
    .kpi-icon.icon-gold  { background: rgba(201,168,76,.15); box-shadow: inset 0 0 0 1px rgba(201,168,76,.2); }
    .kpi-icon.icon-green { background: rgba(52,211,153,.12); box-shadow: inset 0 0 0 1px rgba(52,211,153,.2); }
    .kpi-icon.icon-red   { background: rgba(248,113,113,.12); box-shadow: inset 0 0 0 1px rgba(248,113,113,.2); }
    .kpi-icon.icon-blue  { background: rgba(100,180,255,.12); box-shadow: inset 0 0 0 1px rgba(100,180,255,.2); }

    .kpi-card:hover .kpi-icon { transform: scale(1.08); }
    .kpi-card.color-gold:hover  .kpi-icon { box-shadow: inset 0 0 0 1px rgba(201,168,76,.4), 0 4px 12px rgba(201,168,76,.2); }
    .kpi-card.color-green:hover .kpi-icon { box-shadow: inset 0 0 0 1px rgba(52,211,153,.4),  0 4px 12px rgba(52,211,153,.18); }
    .kpi-card.color-red:hover   .kpi-icon { box-shadow: inset 0 0 0 1px rgba(248,113,113,.4), 0 4px 12px rgba(248,113,113,.18); }
    .kpi-card.color-blue:hover  .kpi-icon { box-shadow: inset 0 0 0 1px rgba(100,180,255,.4), 0 4px 12px rgba(100,180,255,.18); }

    .kpi-icon-inner { font-size: 1.25rem; line-height: 1; }

    /* Label */
    .kpi-label {
      font-size: .72rem;
      font-weight: 700;
      color: var(--mizan-text-muted, rgba(242,237,228,.45));
      text-transform: uppercase;
      letter-spacing: .06em;
      position: relative; z-index: 1;
      transition: color 220ms ease;
    }
    .kpi-card:hover .kpi-label { color: rgba(242,237,228,.65); }

    /* Value */
    .kpi-value {
      font-size: 1.65rem;
      font-weight: 800;
      line-height: 1.1;
      color: var(--mizan-text, #f2ede4);
      font-variant-numeric: tabular-nums;
      letter-spacing: -.02em;
      position: relative; z-index: 1;
    }
    .kpi-value.value-gold  { color: #c9a84c; }
    .kpi-value.value-green { color: #34d399; }
    .kpi-value.value-red   { color: #f87171; }
    .kpi-value.value-blue  { color: #64b4ff; }

    /* Subtitle */
    .kpi-subtitle {
      font-size: .76rem;
      color: var(--mizan-text-muted, rgba(242,237,228,.42));
      margin-top: .1rem;
      position: relative; z-index: 1;
      line-height: 1.4;
    }

    /* Skeleton shimmer */
    .skeleton {
      background: linear-gradient(
        100deg,
        rgba(255,255,255,.04) 0%,
        rgba(255,255,255,.08) 40%,
        rgba(255,255,255,.04) 80%
      );
      background-size: 200% 100%;
      animation: shimmer 1.6s cubic-bezier(0.4,0,0.6,1) infinite;
      border-radius: 6px;
    }
    .skeleton-label    { height: .65rem; width: 52%; margin-bottom: .4rem; }
    .skeleton-value    { height: 1.65rem; width: 70%; margin-bottom: .3rem; }
    .skeleton-subtitle { height: .6rem; width: 42%; }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class V3KpiCardComponent {
  @Input() label!: string;
  @Input() value: string | number | null = null;
  @Input() subtitle?: string;
  @Input() icon?: string;
  @Input() color?: 'gold' | 'green' | 'red' | 'blue';
  @Input() loading = false;
  @Input() tooltip?: string;

  get formattedValue(): string {
    if (this.value === null || this.value === undefined) return '—';
    if (typeof this.value === 'string') return this.value;
    if (typeof this.value === 'number') {
      if (Math.abs(this.value) >= 1000) {
        return this.value.toLocaleString('ar');
      }
      return this.value.toString();
    }
    return String(this.value);
  }
}
