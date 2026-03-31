import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

/**
 * MizanPipe — bilingual translation pipe.
 * Usage: {{ 'totalSales' | mizan }}
 *
 * pure: false so it re-evaluates when the language signal changes.
 * Works in Angular 21 zoneless because templates reading i18n.lang()
 * will schedule a re-render that re-calls transform().
 */
@Pipe({ name: 'mizan', standalone: true, pure: false })
export class MizanPipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(key: string): string {
    return this.i18n.t(key);
  }
}
