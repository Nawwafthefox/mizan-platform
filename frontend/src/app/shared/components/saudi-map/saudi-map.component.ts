import {
  Component, Input, OnChanges, OnDestroy, SimpleChanges,
  AfterViewInit, ElementRef, ViewChild, PLATFORM_ID, Inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

const REGION_COORDS: Record<string, [number, number]> = {
  'الرياض':          [24.71, 46.67],
  'حائل':            [27.52, 41.69],
  'حفر الباطن':      [28.43, 45.97],
  'المدينة المنورة': [24.47, 39.61],
  'الغربية':         [21.42, 39.83],
  'عسير/جيزان':      [18.22, 42.50],
};

const REGION_COLORS: Record<string, string> = {
  'الرياض':          '#3b82f6',
  'الغربية':         '#ec4899',
  'المدينة المنورة': '#8b5cf6',
  'حائل':            '#22c55e',
  'حفر الباطن':      '#06b6d4',
  'عسير/جيزان':      '#f59e0b',
};

@Component({
  selector: 'app-saudi-map',
  standalone: true,
  imports: [CommonModule],
  template: `<div #mapEl class="map-container"></div>`,
  styles: [`
    :host { display: block; }
    .map-container { height: 340px; border-radius: 10px; overflow: hidden; background: #0b1a12; }
    :host ::ng-deep .map-popup {
      background: #0f1f14; border: 1px solid rgba(201,168,76,0.2);
      border-radius: 10px; color: #f2ede4; padding: 12px; min-width: 220px;
    }
    :host ::ng-deep .mp-title { font-weight: 800; font-size: 13px; color: #c9a84c; margin-bottom: 8px; }
    :host ::ng-deep .mp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; font-size: 11px; }
    :host ::ng-deep .mp-label { color: rgba(242,237,228,0.45); font-size: 10px; }
    :host ::ng-deep .mp-val { font-weight: 700; margin-top: 1px; }
    :host ::ng-deep .mp-branches { margin-top: 8px; font-size: 10px; color: rgba(242,237,228,0.6); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px; }
    :host ::ng-deep .leaflet-popup-content-wrapper { background: transparent !important; box-shadow: none !important; border: none !important; padding: 0 !important; }
    :host ::ng-deep .leaflet-popup-content { margin: 0 !important; }
    :host ::ng-deep .leaflet-popup-tip-container { display: none; }
  `]
})
export class SaudiMapComponent implements OnChanges, OnDestroy, AfterViewInit {
  @Input() branches: any[] = [];
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private map: any = null;
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.branches?.length) {
      this.renderMap();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['branches'] && !changes['branches'].firstChange && this.isBrowser) {
      this.renderMap();
    }
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  private destroyMap(): void {
    if (this.map) {
      try { this.map.remove(); } catch (_) {}
      this.map = null;
    }
  }

  private fmtN(n: number): string {
    const a = Math.abs(n ?? 0);
    if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.round(n ?? 0).toLocaleString('en');
  }

  private renderMap(): void {
    if (!this.isBrowser) return;
    this.destroyMap();

    const L = (window as any)['L'];
    if (!L) { console.warn('Leaflet not loaded'); return; }

    // Aggregate by region
    const regionData: Record<string, any> = {};
    for (const b of (this.branches || [])) {
      const r = b.region ?? 'غير محدد';
      if (!regionData[r]) {
        regionData[r] = { sar: 0, count: 0, wn: 0, purch: 0, net: 0, returns: 0, diffs: [], branches: [] };
      }
      const rd = regionData[r];
      rd.sar     += b.totalSarAmount ?? b.sar ?? 0;
      rd.count   += 1;
      rd.wn      += b.netWeight ?? b.wn ?? 0;
      rd.purch   += (b.totalPurchasesAmount ?? 0) + (b.mothanTotal ?? 0);
      rd.net     += b.net ?? 0;
      rd.returns += b.returns ?? 0;
      if ((b.diffRate ?? 0) !== 0) rd.diffs.push(b.diffRate ?? 0);
      rd.branches.push(b.branchName ?? b.name ?? b.code ?? r);
    }

    const maxSar = Math.max(1, ...Object.values(regionData).map((r: any) => r.sar));

    this.map = L.map(this.mapEl.nativeElement, {
      center: [23.8, 43.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 8,
      attributionControl: false,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
    }).addTo(this.map);

    this.map.fitBounds([[16.5, 36], [32, 56]]);

    for (const [region, data] of Object.entries(regionData)) {
      const rd = data as any;
      const coords = REGION_COORDS[region] ?? [23.8, 43.5];
      const color = REGION_COLORS[region] ?? '#c9a84c';
      const radius = Math.max(25000, Math.min(80000, 25000 + 55000 * (rd.sar / maxSar)));
      const avgDiff = rd.diffs.length ? (rd.diffs.reduce((a: number, b: number) => a + b, 0) / rd.diffs.length) : 0;

      // Outer glow
      L.circle(coords, { radius: radius * 1.4, color, fillColor: color, fillOpacity: 0.08, weight: 0, interactive: false }).addTo(this.map);
      // Main circle
      const circle = L.circle(coords, { radius, color, fillColor: color, fillOpacity: 0.35, weight: 2, opacity: 0.6 }).addTo(this.map);
      // Inner core
      L.circle(coords, { radius: radius * 0.4, color, fillColor: color, fillOpacity: 0.7, weight: 0, interactive: false }).addTo(this.map);

      // Label
      const labelIcon = L.divIcon({
        className: '',
        html: `<div style="text-align:center;pointer-events:none">
          <div style="color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap">${region}</div>
          <div style="color:${color};font-size:16px;font-weight:800;line-height:1">${rd.count}</div>
        </div>`,
        iconSize: [100, 40],
        iconAnchor: [50, 20],
      });
      L.marker(coords, { icon: labelIcon, interactive: false }).addTo(this.map);

      // Popup
      const netColor = rd.net >= 0 ? '#22c55e' : '#ef4444';
      const diffColor = avgDiff >= 0 ? '#22c55e' : '#ef4444';
      const popupHtml = `
        <div class="map-popup">
          <div class="mp-title">🗺 ${region} — ${rd.count} فرع</div>
          <div class="mp-grid">
            <div><div class="mp-label">المبيعات</div><div class="mp-val">${this.fmtN(rd.sar)} ر.س</div></div>
            <div><div class="mp-label">المشتريات</div><div class="mp-val">${this.fmtN(rd.purch)} ر.س</div></div>
            <div><div class="mp-label">الصافي</div><div class="mp-val" style="color:${netColor}">${this.fmtN(rd.net)} ر.س</div></div>
            <div><div class="mp-label">فرق المعدل</div><div class="mp-val" style="color:${diffColor}">${avgDiff.toFixed(1)}</div></div>
            <div><div class="mp-label">الوزن</div><div class="mp-val">${rd.wn.toFixed(1)} جم</div></div>
            <div><div class="mp-label">المرتجعات</div><div class="mp-val">${this.fmtN(rd.returns)} ر.س</div></div>
          </div>
          <div class="mp-branches">${rd.branches.slice(0, 6).join(' · ')}</div>
        </div>`;
      circle.bindPopup(popupHtml, { className: '', maxWidth: 280 });
    }

    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 300);
  }
}
