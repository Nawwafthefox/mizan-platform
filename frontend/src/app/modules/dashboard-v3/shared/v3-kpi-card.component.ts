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
      [title]="tooltip || (value !== null && value !== undefined ? value.toString() : '')"
      dir="rtl"
    >
      @if (loading) {
        <div class="skeleton skeleton-label"></div>
        <div class="skeleton skeleton-value"></div>
        <div class="skeleton skeleton-subtitle"></div>
      } @else {
        @if (icon) {
          <div class="kpi-icon" [class]="'icon-' + (color || 'gold')">
            <span>{{ icon }}</span>
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
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: .3rem;
      position: relative;
      overflow: hidden;
      transition: border-color .2s ease, box-shadow .2s ease;
      cursor: default;
    }

    .kpi-card:hover {
      box-shadow: 0 4px 20px rgba(0,0,0,.25);
    }

    .kpi-card.color-gold  { border-color: rgba(201,168,76,.35); }
    .kpi-card.color-green { border-color: rgba(34,197,94,.35); }
    .kpi-card.color-red   { border-color: rgba(239,68,68,.35); }
    .kpi-card.color-blue  { border-color: rgba(59,130,246,.35); }

    .kpi-card.color-gold::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(201,168,76,.05) 0%, transparent 60%);
      pointer-events: none;
    }
    .kpi-card.color-green::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(34,197,94,.05) 0%, transparent 60%);
      pointer-events: none;
    }
    .kpi-card.color-red::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(239,68,68,.05) 0%, transparent 60%);
      pointer-events: none;
    }
    .kpi-card.color-blue::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(59,130,246,.05) 0%, transparent 60%);
      pointer-events: none;
    }

    .kpi-icon {
      font-size: 1.5rem;
      line-height: 1;
      margin-bottom: .15rem;
      width: 2.25rem;
      height: 2.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    }

    .kpi-icon.icon-gold  { background: rgba(201,168,76,.15); }
    .kpi-icon.icon-green { background: rgba(34,197,94,.15); }
    .kpi-icon.icon-red   { background: rgba(239,68,68,.15); }
    .kpi-icon.icon-blue  { background: rgba(59,130,246,.15); }

    .kpi-label {
      font-size: .75rem;
      font-weight: 500;
      color: var(--mizan-text-muted);
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .kpi-value {
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1.1;
      color: var(--mizan-text);
      font-variant-numeric: tabular-nums;
    }

    .kpi-value.value-gold  { color: var(--mizan-gold); }
    .kpi-value.value-green { color: var(--mizan-green); }
    .kpi-value.value-red   { color: var(--mizan-danger); }
    .kpi-value.value-blue  { color: #3b82f6; }

    .kpi-subtitle {
      font-size: .8rem;
      color: var(--mizan-text-muted);
      margin-top: .1rem;
    }

    /* Skeleton shimmer */
    .skeleton {
      background: linear-gradient(
        90deg,
        var(--mizan-border) 25%,
        rgba(255,255,255,.06) 50%,
        var(--mizan-border) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 6px;
    }

    .skeleton-label    { height: .7rem; width: 55%; margin-bottom: .35rem; }
    .skeleton-value    { height: 1.6rem; width: 72%; margin-bottom: .25rem; }
    .skeleton-subtitle { height: .65rem; width: 45%; }

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
