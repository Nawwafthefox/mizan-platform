import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MizanPipe } from '../../../../shared/pipes/mizan.pipe';

@Component({
  selector: 'app-studio-chart-card',
  standalone: true,
  imports: [CommonModule, MizanPipe],
  templateUrl: './studio-chart-card.component.html',
  styleUrls: ['./studio-chart-card.component.scss']
})
export class StudioChartCardComponent {
  @Input() title = '';
  @Input() titleKey = '';
  @Input() subtitle = '';
  @Input() badge = '';
  @Input() height = 280;
}
