/**
 * ReportsScreen — service-layer contract tests (Phase 6).
 */

jest.mock('../services/reportService', () => ({
  reportService: {
    getSummary: jest.fn(),
    getHistory: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reportService } = require('../services/reportService') as {
  reportService: {
    getSummary: jest.Mock;
    getHistory: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reportService.getHistory (contract)', () => {
  it('admin gets both bilty and order arrays with permission flags', async () => {
    reportService.getHistory.mockResolvedValueOnce({
      bilties: [
        {
          id: 1, bilty_no: 'BL-2026-000001', bilty_date: '2026-04-18',
          consignor: 'Acme', truck_no: 'DL-01', item_count: 2,
          created_at: '2026-04-18T00:00:00.000Z',
        },
      ],
      orders: [
        {
          id: 1, order_no: 'OR-2026-000001', order_date: '2026-04-18',
          customer_name: 'Acme', from_loc: 'Delhi', to_loc: 'Mumbai',
          goods_desc: null, status: 'pending', vehicle_id: null, vehicle_no: null,
          created_by: 1, created_at: '2026-04-18T00:00:00.000Z',
          updated_at: '2026-04-18T00:00:00.000Z',
        },
      ],
      permissions: { bilty: true, order: true },
    });
    const h = await reportService.getHistory();
    expect(h.bilties).toHaveLength(1);
    expect(h.orders).toHaveLength(1);
    expect(h.bilties[0].bilty_no).toBe('BL-2026-000001');
    expect(h.orders[0].order_no).toBe('OR-2026-000001');
    expect(h.permissions.bilty).toBe(true);
    expect(h.permissions.order).toBe(true);
  });

  it('staff with only order.read gets empty bilties + permission flag false', async () => {
    reportService.getHistory.mockResolvedValueOnce({
      bilties: [],
      orders: [
        {
          id: 9, order_no: 'OR-2026-000009', order_date: '2026-04-18',
          customer_name: 'Z', from_loc: null, to_loc: null, goods_desc: null,
          status: 'pending', vehicle_id: null, vehicle_no: null,
          created_by: 2, created_at: '2026-04-18T00:00:00.000Z',
          updated_at: '2026-04-18T00:00:00.000Z',
        },
      ],
      permissions: { bilty: false, order: true },
    });
    const h = await reportService.getHistory();
    expect(h.bilties).toEqual([]);
    expect(h.orders).toHaveLength(1);
    expect(h.permissions.bilty).toBe(false);
    expect(h.permissions.order).toBe(true);
  });

  it('truly permission-less user gets both empty + both flags false — UI shows empty state', async () => {
    reportService.getHistory.mockResolvedValueOnce({
      bilties: [],
      orders: [],
      permissions: { bilty: false, order: false },
    });
    const h = await reportService.getHistory();
    expect(h.bilties).toEqual([]);
    expect(h.orders).toEqual([]);
    expect(h.permissions.bilty).toBe(false);
    expect(h.permissions.order).toBe(false);
  });
});
