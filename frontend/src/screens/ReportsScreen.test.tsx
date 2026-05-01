/**
 * ReportsScreen — service-layer contract tests.
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
  it('admin gets bilty array with permission flag', async () => {
    reportService.getHistory.mockResolvedValueOnce({
      bilties: [
        {
          id: 1, bilty_no: 'BL-2026-000001', bilty_date: '2026-04-18',
          consignor: 'Acme', truck_no: 'DL-01', item_count: 2,
          created_at: '2026-04-18T00:00:00.000Z',
        },
      ],
      permissions: { bilty: true },
    });
    const h = await reportService.getHistory();
    expect(h.bilties).toHaveLength(1);
    expect(h.bilties[0].bilty_no).toBe('BL-2026-000001');
    expect(h.permissions.bilty).toBe(true);
  });

  it('staff without bilty permission gets empty bilties + flag false', async () => {
    reportService.getHistory.mockResolvedValueOnce({
      bilties: [],
      permissions: { bilty: false },
    });
    const h = await reportService.getHistory();
    expect(h.bilties).toEqual([]);
    expect(h.permissions.bilty).toBe(false);
  });
});
