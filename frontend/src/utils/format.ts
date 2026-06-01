// Shared formatters for currency / quantity display.
// Convention: integer-valued amounts render without trailing `.00` so tables
// stay tight ("₹15000" instead of "₹15000.00"); fractional amounts keep their
// decimals ("₹15000.50").

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatAmount(v: unknown): string {
  const n = toNum(v);
  const s = n.toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

export function formatQty(v: unknown): string {
  const n = toNum(v);
  const s = n.toFixed(3);
  return s.endsWith('.000') ? s.slice(0, -4) : s.replace(/0+$/, '').replace(/\.$/, '');
}

export function formatCurrency(v: unknown): string {
  return `₹${formatAmount(v)}`;
}
