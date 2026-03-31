import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DateRangeService } from '../../../core/services/date-range.service';

@Component({
  selector: 'app-date-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="date-filter">
      <div class="period-pills">
        <button [class.active]="svc.activePeriod() === 'today'" (click)="set('today')">آخر يوم</button>
        <button [class.active]="svc.activePeriod() === 'week'" (click)="set('week')">آخر 7 أيام</button>
        <button [class.active]="svc.activePeriod() === 'month'" (click)="set('month')">هذا الشهر</button>
        <button [class.active]="svc.activePeriod() === 'all'" (click)="set('all')">كل البيانات</button>
        <button [class.active]="svc.activePeriod() === 'custom'" (click)="set('custom')">مخصص</button>
      </div>
      @if (svc.activePeriod() === 'custom') {
        <div class="custom-range">
          <input type="date" [(ngModel)]="customFrom">
          <span>←</span>
          <input type="date" [(ngModel)]="customTo">
          <button class="apply-btn" (click)="applyCustom()">تطبيق</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .date-filter {
      display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin-bottom: 1.25rem;
    }
    .period-pills { display: flex; flex-wrap: wrap; gap: .4rem; }
    .period-pills button {
      padding: .35rem .85rem; border-radius: 20px; font-size: .82rem; font-weight: 500;
      border: 1px solid var(--mizan-border); background: var(--mizan-surface);
      color: var(--mizan-text-muted); cursor: pointer; transition: all .15s;
    }
    .period-pills button:hover { border-color: var(--mizan-gold); color: var(--mizan-gold); }
    .period-pills button.active {
      background: var(--mizan-gold); color: var(--mizan-green-dark);
      border-color: var(--mizan-gold); font-weight: 700;
    }
    .custom-range { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .custom-range input {
      padding: .3rem .5rem; border: 1px solid var(--mizan-border); border-radius: 6px;
      background: var(--mizan-surface); color: var(--mizan-text); font-size: .82rem;
    }
    .apply-btn {
      padding: .3rem .8rem; border-radius: 6px; background: var(--mizan-green);
      color: #fff; border: none; font-size: .82rem; font-weight: 600; cursor: pointer;
    }
  `]
})
export class DateFilterComponent {
  svc = inject(DateRangeService);
  dateChange = output<void>();
  customFrom = '';
  customTo = '';

  set(period: 'today'|'week'|'month'|'all'|'custom'): void {
    if (period === 'custom') {
      this.customFrom = this.svc.getFrom();
      this.customTo = this.svc.getTo();
      this.svc.activePeriod.set('custom');
      return;
    }
    if (period === 'today') this.svc.setToday();
    else if (period === 'week') this.svc.setLast7Days();
    else if (period === 'month') this.svc.setThisMonth();
    else if (period === 'all') this.svc.setAllData();
    this.dateChange.emit();
  }

  applyCustom(): void {
    if (this.customFrom && this.customTo) {
      this.svc.setCustom(this.customFrom, this.customTo);
      this.dateChange.emit();
    }
  }
}
