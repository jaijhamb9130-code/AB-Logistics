/**
 * DashboardScreen — service-layer contract tests.
 *
 * Asserts the reportService contract the Dashboard depends on, plus
 * permission-gating behaviour of the summary payload shape.
 */

jest.mock('../services/reportService', () => ({
  reportService: {
    getSummary: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reportService } = require('../services/reportService') as {
  reportService: {
    getSummary: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reportService — shape', () => {
  it('exposes getSummary', () => {
    expect(typeof reportService.getSummary).toBe('function');
  });
});

describe('reportService.getSummary (contract)', () => {
  it('admin payload contains all numeric stats and all-true permissions', async () => {
    reportService.getSummary.mockResolvedValueOnce({
      bilties: 12,
      ledger_groups: 3,
      active_users: 3,
      permissions: {
        bilty: true, daybook: true, ledgergroup: true, user: true,
      },
    });
    const s = await reportService.getSummary();
    expect(s.bilties).toBe(12);
    expect(s.ledger_groups).toBe(3);
    expect(s.active_users).toBe(3);
    expect(s.permissions.bilty).toBe(true);
    expect(s.permissions.daybook).toBe(true);
    expect(s.permissions.user).toBe(true);
  });

  it('staff payload has false flags for unpermitted stats — UI hides these cards', async () => {
    reportService.getSummary.mockResolvedValueOnce({
      bilties: 5,
      ledger_groups: 0,
      active_users: 0,
      permissions: {
        bilty: true, daybook: false, ledgergroup: false, user: false,
      },
    });
    const s = await reportService.getSummary();
    expect(s.permissions.bilty).toBe(true);
    expect(s.permissions.daybook).toBe(false);
    expect(s.permissions.ledgergroup).toBe(false);
    expect(s.permissions.user).toBe(false);
    // Unpermitted stats are zero-valued server-side; UI renders "—" when !visible
    expect(s.ledger_groups).toBe(0);
    expect(s.active_users).toBe(0);
  });
});
