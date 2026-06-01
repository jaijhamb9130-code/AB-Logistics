import {
  hasErrors,
  itemsTotal,
  netPayable,
  validateBilty,
} from './biltyValidation';

const goodHeader = { consignor: 'Acme', truck_no: 'DL-01' };

describe('validateBilty', () => {
  it('flags missing consignor', () => {
    const e = validateBilty({ consignor: '', truck_no: 'DL-01' } as any, [
      { qty: 1, rate: 10 } as any,
    ]);
    expect(e.consignor).toBe('required');
    expect(e.truck_no).toBeUndefined();
  });

  it('flags missing truck_no', () => {
    const e = validateBilty({ consignor: 'A', truck_no: '' } as any, [
      { qty: 1, rate: 10 } as any,
    ]);
    expect(e.truck_no).toBe('required');
  });

  it('flags empty items', () => {
    const e = validateBilty(goodHeader as any, []);
    expect(e.items).toBe('required');
  });

  it('flags item with qty=0', () => {
    const e = validateBilty(goodHeader as any, [
      { qty: 0, rate: 10 } as any,
    ]);
    expect(e.items).toBe('invalid_row');
  });

  it('flags item with rate=0', () => {
    const e = validateBilty(goodHeader as any, [
      { qty: 10, rate: 0 } as any,
    ]);
    expect(e.items).toBe('invalid_row');
  });

  it('passes on valid header + items', () => {
    const e = validateBilty(goodHeader as any, [
      { qty: 10, rate: 100 } as any,
    ]);
    expect(hasErrors(e)).toBe(false);
  });
});

describe('totals helpers', () => {
  it('itemsTotal sums qty × rate across items (tolerates string inputs)', () => {
    expect(
      itemsTotal([
        { qty: 10, rate: 100 } as any,
        { qty: '5', rate: '20' } as any,
      ])
    ).toBe(1100);
  });

  it('netPayable = itemsTotal', () => {
    const np = netPayable([{ qty: 10, rate: 100 } as any]);
    expect(np).toBe(1000);
  });

  it('netPayable handles empty array gracefully', () => {
    expect(netPayable([])).toBe(0);
  });
});
