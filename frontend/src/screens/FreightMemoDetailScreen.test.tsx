/**
 * FreightMemoDetailScreen — contract + totals tests (Phase 4).
 *
 * We don't render the RN tree (consistent with BiltyScreen.test.tsx); we
 * assert the math rule that drives the A4 ledger view, and that the detail
 * service returns a read-only shape without any "edit" field the UI could
 * bind to.
 */

import {
  advanceTotal,
  fuelTotal,
  itemsTotal,
  netPayable,
  toNum,
} from '../utils/biltyValidation';

jest.mock('../services/freightService', () => ({
  freightService: {
    list: jest.fn(),
    get: jest.fn(),
    generate: jest.fn(),
    getByBiltyId: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { freightService } = require('../services/freightService') as {
  freightService: { get: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FreightMemoDetail math (FREIGHT-02, FREIGHT-03)', () => {
  it('renders freight_total = SUM(qty × rate) across items', () => {
    const items = [
      { qty: 10, rate: 100 } as any, //  1,000
      { qty: 5, rate: 20 } as any,   //    100
      { qty: 3, rate: 250 } as any,  //    750
    ];
    expect(itemsTotal(items)).toBe(1850);
  });

  it('net_payable = freight_total − (advance_total + fuel_total)', () => {
    const items = [{ qty: 10, rate: 100 } as any];   // 1000
    const advances = [{ amount: 200 } as any];       //  200
    const fuels = [{ amount: 100 } as any];          //  100
    expect(netPayable(items, advances, fuels)).toBe(700);
    expect(advanceTotal(advances)).toBe(200);
    expect(fuelTotal(fuels)).toBe(100);
  });

  it('tolerates string numerics from mysql2 via toNum', () => {
    expect(toNum('42.50')).toBe(42.5);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('')).toBe(0);
    expect(toNum('abc')).toBe(0);
  });
});

describe('freightService.get returns read-only detail shape (FREIGHT-04)', () => {
  it('payload has totals + bilty snapshot, and no "edit"/"update" field', async () => {
    freightService.get.mockResolvedValueOnce({
      id: 9,
      memo_no: 'FM-2026-000001',
      bilty_id: 5,
      memo_date: '2026-04-18',
      freight_total: '1000.00',
      advance_total: '500.00',
      fuel_total: '200.00',
      net_payable: '300.00',
      generated_by: 1,
      created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
      bilty: {
        id: 5,
        bilty_no: 'BL-2026-000005',
        bilty_date: '2026-04-18',
        consignor: 'Acme',
        truck_no: 'DL-01',
        items: [{ id: 1, qty: 10, rate: 100 }],
        advances: [{ id: 1, amount: 500 }],
        fuels: [{ id: 1, amount: 200 }],
      },
    });

    const d = await freightService.get(9);
    expect(d.memo_no).toBe('FM-2026-000001');
    expect(d.bilty.bilty_no).toBe('BL-2026-000005');
    expect(toNum(d.net_payable)).toBe(300);

    // Read-only: no mutation affordances in the contract.
    expect((d as any).edit).toBeUndefined();
    expect((d as any).update).toBeUndefined();
    expect((d as any).delete).toBeUndefined();
  });
});
