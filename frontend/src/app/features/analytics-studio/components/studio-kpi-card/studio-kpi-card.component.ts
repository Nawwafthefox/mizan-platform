import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MizanPipe } from '../../../../shared/pipes/mizan.pipe';

@Component({
  selector: 'app-studio-kpi-card',
  standalone: true,
  imports: [CommonModule, MizanPipe],
  templateUrl: './studio-kpi-card.component.html',
  styleUrls: ['./studio-kpi-card.component.scss']
})
export class StudioKpiCardComponent {
  @Input() icon = '';
  @Input() labelKey = '';
  @Input() value = '';
  @Input() sub = '';
  @Input() accentColor = 'var(--studio-gold)';
  @Input() valueClass: 'pos' | 'neg' | 'amber' | 'teal' | '' = '';
  @Input() tooltipKey = '';
  @Input() tooltipValue = '';
  @Input() rank?: number;
  hovered = false;
}
