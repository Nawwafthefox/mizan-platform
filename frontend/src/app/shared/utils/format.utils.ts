export function fmtN(n: number, d = 1): string {
  const a = Math.abs(n ?? 0);
  if (a >= 1_000_000) return ((n ?? 0) / 1_000_000).toFixed(d) + 'M';
  if (a >= 1_000)     return ((n ?? 0) / 1_000).toFixed(d < 1 ? 0 : d) + 'K';
  return Math.round(n ?? 0).toLocaleString('en');
}

export function fmtSar(n: number): string {
  return fmtN(n) + ' ر.س';
}

export function fmtWt(n: number, isAr = true): string {
  const g = +n || 0;
  if (Math.abs(g) >= 1000) return (g / 1000).toFixed(2) + (isAr ? ' كجم' : ' KG');
  return g.toFixed(2) + (isAr ? ' جم' : ' g');
}

export function ringPct(value: number, total: number, cap = 100): number {
  if (!total) return 0;
  return Math.min(cap, Math.max(0, Math.round((value / total) * 100)));
}
