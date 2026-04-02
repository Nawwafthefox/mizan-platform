import { Component, Input, OnChanges, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface V3TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  format?: 'number' | 'currency' | 'pct' | 'rate' | 'text';
  width?: string;
  colorFn?: (val: any) => string;
}

type SortDir = 'asc' | 'desc' | null;

@Component({
  selector: 'v3-data-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-wrapper" dir="rtl">
      <table class="v3-table">
        <thead>
          <tr>
            @for (col of columns; track col.key) {
              <th
                [style.width]="col.width || 'auto'"
                [class.sortable]="true"
                [class.sort-asc]="sortKey() === col.key && sortDir() === 'asc'"
                [class.sort-desc]="sortKey() === col.key && sortDir() === 'desc'"
                [style.text-align]="col.align || 'right'"
                (click)="onSort(col.key)"
              >
                <span class="th-inner">
                  {{ col.label }}
                  <span class="sort-icon">
                    @if (sortKey() === col.key) {
                      {{ sortDir() === 'asc' ? '↑' : '↓' }}
                    } @else {
                      <span class="sort-neutral">⇅</span>
                    }
                  </span>
                </span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @if (loading) {
            @for (row of skeletonRows; track $index) {
              <tr class="skeleton-row">
                @for (col of columns; track col.key) {
                  <td>
                    <div class="skeleton-cell"></div>
                  </td>
                }
              </tr>
            }
          } @else if (sortedRows().length === 0) {
            <tr>
              <td [attr.colspan]="columns.length" class="empty-cell">
                {{ emptyMessage || 'لا توجد بيانات' }}
              </td>
            </tr>
          } @else {
            @for (row of sortedRows(); track $index) {
              <tr [class.even]="$index % 2 === 1">
                @for (col of columns; track col.key) {
                  <td
                    [style.text-align]="col.align || 'right'"
                    [style.color]="col.colorFn ? col.colorFn(row[col.key]) : getCellColor(col, row[col.key])"
                  >
                    {{ formatCell(col, row[col.key]) }}
                  </td>
                }
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid var(--mizan-border);
    }

    .v3-table {
      width: 100%;
      border-collapse: collapse;
      font-size: .875rem;
      color: var(--mizan-text);
      direction: rtl;
    }

    thead {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--mizan-surface);
    }

    th {
      padding: .75rem 1rem;
      font-weight: 600;
      font-size: .75rem;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: var(--mizan-text-muted);
      border-bottom: 1px solid var(--mizan-border);
      white-space: nowrap;
      user-select: none;
      background: var(--mizan-surface);
      transition: color .15s ease;
    }

    th.sortable { cursor: pointer; }
    th.sortable:hover { color: var(--mizan-gold); }
    th.sort-asc,
    th.sort-desc { color: var(--mizan-gold); }

    .th-inner {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
    }

    .sort-icon { font-size: .75rem; opacity: .8; }
    .sort-neutral { opacity: .35; }

    td {
      padding: .65rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    tr:last-child td { border-bottom: none; }

    tr.even td {
      background: rgba(255,255,255,.02);
    }

    tr:hover td {
      background: rgba(201,168,76,.06);
    }

    /* Skeleton */
    .skeleton-row td { padding: .75rem 1rem; }

    .skeleton-cell {
      height: .875rem;
      width: 70%;
      border-radius: 4px;
      background: linear-gradient(
        90deg,
        var(--mizan-border) 25%,
        rgba(255,255,255,.06) 50%,
        var(--mizan-border) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
    }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .empty-cell {
      text-align: center !important;
      padding: 2.5rem 1rem;
      color: var(--mizan-text-muted);
      font-size: .9rem;
    }
  `]
})
export class V3DataTableComponent implements OnChanges {
  @Input() columns: V3TableColumn[] = [];
  @Input() rows: any[]              = [];
  @Input() loading                  = false;
  @Input() emptyMessage?: string;

  sortKey  = signal<string | null>(null);
  sortDir  = signal<SortDir>(null);

  skeletonRows = Array(6).fill(null);

  sortedRows = computed(() => {
    const key = this.sortKey();
    const dir = this.sortDir();
    if (!key || !dir || !this.rows?.length) return this.rows ?? [];

    return [...this.rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ar');
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  ngOnChanges(): void {
    // Reset sort when rows change externally if desired — keep sort for usability
  }

  onSort(key: string): void {
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDir.set('desc');
    } else if (this.sortDir() === 'desc') {
      this.sortDir.set('asc');
    } else if (this.sortDir() === 'asc') {
      this.sortKey.set(null);
      this.sortDir.set(null);
    }
  }

  formatCell(col: V3TableColumn, val: any): string {
    if (val === null || val === undefined) return '—';
    switch (col.format) {
      case 'number':
        return typeof val === 'number'
          ? (Math.abs(val) >= 1000 ? val.toLocaleString('ar') : val.toString())
          : String(val);
      case 'currency':
        return typeof val === 'number'
          ? val.toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : String(val);
      case 'pct':
        return typeof val === 'number' ? `${val.toFixed(1)}%` : String(val);
      case 'rate':
        return typeof val === 'number' ? val.toFixed(4) : String(val);
      case 'text':
      default:
        return String(val);
    }
  }

  getCellColor(col: V3TableColumn, val: any): string {
    if (typeof val !== 'number') return '';
    const diffKeys = ['diff', 'net', 'change', 'delta', 'variance'];
    const isMetric = diffKeys.some(k => col.key.toLowerCase().includes(k));
    if (!isMetric) return '';
    if (val > 0) return 'var(--mizan-green)';
    if (val < 0) return 'var(--mizan-danger)';
    return '';
  }
}
