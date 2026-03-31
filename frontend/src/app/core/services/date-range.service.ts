import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DateRangeService {
  fromDate = signal<string>('');
  toDate = signal<string>('');
  activePeriod = signal<'today'|'week'|'month'|'all'|'custom'>('month');

  constructor() { this.setThisMonth(); }

  private today(): string { return new Date().toISOString().slice(0, 10); }
  private daysAgo(n: number): string {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  setToday(): void {
    const t = this.today();
    this.fromDate.set(t);
    this.toDate.set(t);
    this.activePeriod.set('today');
  }

  setThisMonth(): void {
    const d = new Date(); d.setDate(1);
    this.fromDate.set(d.toISOString().slice(0, 10));
    this.toDate.set(this.today());
    this.activePeriod.set('month');
  }

  setLast7Days(): void {
    this.fromDate.set(this.daysAgo(7));
    this.toDate.set(this.today());
    this.activePeriod.set('week');
  }

  setAllData(): void {
    this.fromDate.set('2020-01-01');
    this.toDate.set(this.today());
    this.activePeriod.set('all');
  }

  setCustom(from: string, to: string): void {
    this.fromDate.set(from);
    this.toDate.set(to);
    this.activePeriod.set('custom');
  }

  getFrom(): string { return this.fromDate(); }
  getTo(): string { return this.toDate(); }
}
