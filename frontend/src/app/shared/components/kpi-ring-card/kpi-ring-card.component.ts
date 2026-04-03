import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MizanPipe } from '../../pipes/mizan.pipe';

@Component({
  selector: 'app-kpi-ring-card',
  standalone: true,
  imports: [CommonModule, MizanPipe],
  template: `
    <div class="mz-kpi-card" [style.--ring-color]="ringColor || 'var(--mz-gold)'"
         [attr.data-tooltip]="sub || null">
      <!-- Animated ring -->
      <div class="kc-ring">
        <svg viewBox="0 0 64 64" width="64" height="64" class="ring-svg">
          <circle class="ring-bg" cx="32" cy="32" r="27"/>
          <circle class="ring-fg" cx="32" cy="32" r="27"
            [attr.stroke]="ringColor || 'var(--mz-gold)'"
            [attr.stroke-dasharray]="CIRC"
            [attr.stroke-dashoffset]="dashOffset"
            transform="rotate(-90 32 32)"/>
        </svg>
        <!-- Ring glow (shows on hover) -->
        <div class="ring-glow"></div>
        <div class="ring-icon">{{ icon }}</div>
      </div>

      <!-- Info -->
      <div class="kc-info">
        <div class="kc-label">{{ label | mizan }}</div>
        <div class="kc-value" [ngClass]="valueClass">{{ value }}</div>
        <div class="kc-sub" *ngIf="sub">{{ sub }}</div>
      </div>

      <!-- Left accent bar -->
      <div class="kc-accent"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .mz-kpi-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--mz-surface, #1b3427);
      border: 1px solid var(--mz-border, rgba(201,168,76,0.14));
      border-radius: 12px;
      padding: 14px 16px;
      min-height: 88px;
      position: relative;
      overflow: hidden;
      cursor: default;
      transition:
        transform     220ms cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow    220ms cubic-bezier(0.22, 1, 0.36, 1),
        border-color  220ms cubic-bezier(0.22, 1, 0.36, 1),
        background    220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* Left accent bar — slides in on hover */
    .kc-accent {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      width: 3px;
      background: var(--ring-color, var(--mz-gold));
      border-radius: 0 2px 2px 0;
      transform: scaleY(0.3);
      opacity: 0;
      transition:
        transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
        opacity   220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .mz-kpi-card:hover {
      transform: translateY(-2px);
      border-color: rgba(201,168,76, 0.38);
      box-shadow:
        0 8px 28px rgba(0,0,0, 0.32),
        0 0 0 1px rgba(201,168,76, 0.1),
        inset 0 1px 0 rgba(255,255,255, 0.04);

      .kc-accent {
        transform: scaleY(1);
        opacity: 1;
      }

      .ring-glow {
        opacity: 1;
      }

      .ring-svg {
        filter: drop-shadow(0 0 6px color-mix(in srgb, var(--ring-color) 45%, transparent));
      }

      .ring-icon {
        transform: scale(1.1);
      }
    }

    /* Ring container */
    .kc-ring {
      position: relative;
      flex-shrink: 0;
      width: 64px;
      height: 64px;
    }

    .ring-svg {
      transition: filter 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .ring-bg {
      fill: none;
      stroke: rgba(255,255,255, 0.06);
      stroke-width: 4;
    }

    .ring-fg {
      fill: none;
      stroke-width: 4;
      stroke-linecap: round;
      transition: stroke-dashoffset 800ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* Glow overlay — appears behind ring icon on hover */
    .ring-glow {
      position: absolute;
      inset: 10px;
      border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--ring-color) 20%, transparent), transparent 70%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 220ms ease;
    }

    .ring-icon {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* Info section */
    .kc-info {
      flex: 1;
      min-width: 0;
    }

    .kc-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--mz-text-3, rgba(242,237,228, 0.38));
      text-transform: uppercase;
      letter-spacing: 0.9px;
      margin-bottom: 4px;
      transition: color 220ms ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mz-kpi-card:hover .kc-label { color: var(--mz-text-2, rgba(242,237,228, 0.58)); }

    .kc-value {
      font-size: 21px;
      font-weight: 800;
      color: var(--mz-text, #f2ede4);
      letter-spacing: -0.5px;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .kc-value.pos  { color: var(--mz-green-pop, #34d399); }
    .kc-value.neg  { color: var(--mz-red-pop, #f87171); }
    .kc-value.gold { color: var(--mz-gold, #c9a84c); }

    .kc-sub {
      font-size: 10px;
      color: var(--mz-text-3, rgba(242,237,228, 0.38));
      margin-top: 5px;
      line-height: 1.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `]
})
export class KpiRingCardComponent implements OnChanges {
  @Input() icon = '◈';
  @Input() label = '';
  @Input() value = '';
  @Input() sub = '';
  @Input() ringColor = '#c9a84c';
  @Input() ringPct = 75;
  @Input() valueClass = '';

  readonly CIRC = 2 * Math.PI * 27; // 169.646
  dashOffset = this.CIRC;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ringPct']) {
      const pct = Math.min(100, Math.max(0, this.ringPct ?? 0));
      this.dashOffset = this.CIRC * (1 - pct / 100);
    }
  }
}
