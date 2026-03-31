import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  readonly REGION_COLORS: Record<string, string> = {
    'الرياض': '#3b82f6',
    'الغربية': '#ec4899',
    'المدينة المنورة': '#8b5cf6',
    'حائل': '#22c55e',
    'حفر الباطن': '#06b6d4',
    'عسير/جيزان': '#f59e0b',
  };

  getRegionColor(region: string): string {
    return this.REGION_COLORS[region] ?? '#94a3b8';
  }

  classifyEmployee(saleRate: number): { label: string; css: string } {
    if (saleRate >= 700) return { label: 'ممتاز', css: 'badge-gold' };
    if (saleRate >= 600) return { label: 'جيد', css: 'badge-green' };
    if (saleRate >= 500) return { label: 'متوسط', css: 'badge-yellow' };
    return { label: 'ضعيف', css: 'badge-red' };
  }

  formatSAR(value: number): string {
    return (value ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 }) + ' ر.س';
  }

  formatWeight(value: number): string {
    return (value ?? 0).toFixed(2) + ' جم';
  }

  formatRate(value: number): string {
    return (value ?? 0).toFixed(2) + ' ر.س/جم';
  }

  getDiffClass(diff: number): string {
    if (diff > 0) return 'pos';
    if (diff < 0) return 'neg';
    return '';
  }

  getDiffBadgeClass(diff: number): string {
    if (diff > 0) return 'badge-green';
    if (diff < 0) return 'badge-red';
    return 'badge-yellow';
  }
}
