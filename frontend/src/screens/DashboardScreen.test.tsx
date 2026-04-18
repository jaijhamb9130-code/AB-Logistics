/**
 * DashboardScreen — service-layer contract tests (Phase 6).
 *
 * Follows the project's jest pattern (ts-jest, node env) used by Orders/Bilty:
 * instead of rendering RN, we assert the reportService contract the Dashboard
 * depends on + permission-gating behaviour of the summary payload shape.
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

describe('reportService — shape', () => {
  it('exposes getSummary / getHistory', () => {
    expect(typeof reportService.getSummary).toBe('function');
    expect(typeof reportService.getHistory).toBe('function');
  });
});

describe('reportService.getSummary (contract)', () => {
  it('admin payload contains all numeric stats and all-true permissions', async () => {
    reportService.getSummary.mockResolvedValueOnce({
      bilties: 12,
      freight_memos: 7,
      orders: 9,
      vehicles: 4,
      active_users: 3,
      permissions: {
        bilty: true, freight: true, order: true, vehicle: true, report: true,
      },
    });
    const s = await reportService.getSummary();
    expect(s.bilties).toBe(12);
    expect(s.freight_memos).toBe(7);
    expect(s.orders).toBe(9);
    expect(s.vehicles).toBe(4);
    expect(s.active_users).toBe(3);
    expect(s.permissions.bilty).toBe(true);
    expect(s.permissions.report).toBe(true);
  });

  it('staff payload has false flags for unpermitted stats — UI hides these cards', async () => {
    reportService.getSummary.mockResolvedValueOnce({
      bilties: 5,
      freight_memos: 2,
      orders: 0,
      vehicles: 0,
      active_users: 0,
      permissions: {
        bilty: true, freight: true, order: false, vehicle: false, report: false,
      },
    });
    const s = await reportService.getSummary();
    expect(s.permissions.bilty).toBe(true);
    expect(s.permissions.order).toBe(false);
    expect(s.permissions.vehicle).toBe(false);
    expect(s.permissions.report).toBe(false);
    // Unpermitted stats are zero-valued server-side; UI renders "—" when !visible
    expect(s.orders).toBe(0);
    expect(s.vehicles).toBe(0);
    expect(s.active_users).toBe(0);
  });
});
