import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class V3DateRangeService {
  from = signal<string>('');
  to   = signal<string>('');

  constructor() {
    const today    = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.from.set(this.fmt(firstDay));
    this.to.set(this.fmt(today));
  }

  fmt(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  setRange(from: string, to: string): void {
    this.from.set(from);
    this.to.set(to);
  }

  setLastDays(n: number): void {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - n + 1);
    this.setRange(this.fmt(from), this.fmt(to));
  }

  setToday(): void {
    const today = new Date();
    const str   = this.fmt(today);
    this.setRange(str, str);
  }

  setCurrentMonth(): void {
    const today    = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.setRange(this.fmt(firstDay), this.fmt(today));
  }

  setLastMonth(): void {
    const today   = new Date();
    const first   = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last    = new Date(today.getFullYear(), today.getMonth(), 0);
    this.setRange(this.fmt(first), this.fmt(last));
  }
}
