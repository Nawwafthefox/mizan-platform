import { Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/services/i18n.service';
import { configureCharts } from './core/chart-config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host { display: block; height: 100%; }']
})
export class App {
  private i18n = inject(I18nService);

  constructor() {
    // Re-run whenever language changes to update chart defaults + DOM direction
    effect(() => {
      configureCharts(this.i18n.lang());
    });
  }
}
