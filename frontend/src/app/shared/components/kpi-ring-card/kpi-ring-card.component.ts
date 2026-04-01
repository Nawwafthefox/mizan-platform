import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MizanPipe } from '../../pipes/mizan.pipe';

@Component({
  selector: 'app-kpi-ring-card',
  standalone: true,
  imports: [CommonModule, MizanPipe],
  template: `
    <div class="mz-kpi-card">
      <div class="kc-ring">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle class="ring-bg" cx="32" cy="32" r="27"/>
          <circle class="ring-fg" cx="32" cy="32" r="27"
            [attr.stroke]="ringColor || 'var(--mz-gold)'"
            [attr.stroke-dasharray]="CIRC"
            [attr.stroke-dashoffset]="dashOffset"
            transform="rotate(-90 32 32)"/>
        </svg>
        <div class="ring-icon">{{ icon }}</div>
      </div>
      <div class="kc-info">
        <div class="kc-label">{{ label | mizan }}</div>
        <div class="kc-value" [ngClass]="valueClass">{{ value }}</div>
        <div class="kc-sub" *ngIf="sub">{{ sub }}</div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .mz-kpi-card {
      display: flex; align-items: center; gap: 14px;
      background: var(--mz-surface, #1b3427);
      border: 1px solid var(--mz-border, rgba(201,168,76,0.14));
      border-inline-start: 3px solid var(--mz-gold, #c9a84c);
      border-radius: 10px; padding: 16px 18px; min-height: 88px;
      transition: all 240ms ease;
    }
    .mz-kpi-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    }
    .kc-ring { position: relative; flex-shrink: 0; width: 64px; height: 64px; }
    .ring-bg { fill: none; stroke: rgba(255,255,255,0.07); stroke-width: 4; }
    .ring-fg { fill: none; stroke-width: 4; stroke-linecap: round;
               transition: stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1); }
    .ring-icon {
      position: absolute; inset: 0; display: flex;
      align-items: center; justify-content: center; font-size: 20px;
    }
    .kc-info { flex: 1; min-width: 0; }
    .kc-label {
      font-size: 10px; font-weight: 700; color: var(--mz-text-3, rgba(242,237,228,0.45));
      text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;
    }
    .kc-value {
      font-size: 20px; font-weight: 800; color: var(--mz-text, #f2ede4);
      letter-spacing: -0.4px; line-height: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .kc-value.pos { color: #22c55e; }
    .kc-value.neg { color: #ef4444; }
    .kc-value.gold { color: var(--mz-gold, #c9a84c); }
    .kc-sub { font-size: 10px; color: var(--mz-text-3, rgba(242,237,228,0.45)); margin-top: 5px; line-height: 1.5; }
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
