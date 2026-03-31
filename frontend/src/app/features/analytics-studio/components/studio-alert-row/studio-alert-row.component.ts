import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-studio-alert-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="studio-alert" [ngClass]="severity">
      <span class="studio-alert-icon">{{ icon }}</span>
      <span class="studio-alert-msg">{{ message }}</span>
    </div>
  `,
  styles: [`
    .studio-alert {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 16px; border-radius: 10px;
      border-inline-start: 3px solid;
      background: rgba(201,168,76,0.025);
      font-size: 12px; font-weight: 500; color: var(--studio-text);
      transition: background 200ms;
      font-family: var(--studio-sans);
    }
    .studio-alert:hover { background: rgba(201,168,76,0.055); }
    .studio-alert-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .studio-alert.red   { border-color: var(--studio-red-pop,   #f87171); }
    .studio-alert.amber { border-color: var(--studio-amber-pop, #fbbf24); }
    .studio-alert.green { border-color: var(--studio-green-pop, #34d399); }
  `]
})
export class StudioAlertRowComponent {
  @Input() icon = '⚠️';
  @Input() message = '';
  @Input() severity: 'red' | 'amber' | 'green' = 'amber';
}
