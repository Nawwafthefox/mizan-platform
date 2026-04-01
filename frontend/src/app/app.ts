import { Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/services/i18n.service';
import { KeepAliveService } from './core/services/keep-alive.service';
import { configureCharts } from './core/chart-config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host { display: block; height: 100%; }']
})
export class App {
  private i18n = inject(I18nService);
  private keepAlive = inject(KeepAliveService);

  constructor() {
    effect(() => {
      configureCharts(this.i18n.lang());
    });
    this.keepAlive.start();
  }
}
