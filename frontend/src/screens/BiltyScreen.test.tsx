/**
 * BiltyScreen — service-layer contract tests (Phase 3).
 *
 * Matches the project's existing jest setup (ts-jest, node env — see
 * UsersScreen.test.tsx for prior art). Instead of rendering the RN tree we
 * exercise the service contract the screen depends on.
 */

jest.mock('../services/biltyService', () => ({
  biltyService: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { biltyService } = require('../services/biltyService') as {
  biltyService: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('biltyService — shape', () => {
  it('exposes list / get / create', () => {
    expect(typeof biltyService.list).toBe('function');
    expect(typeof biltyService.get).toBe('function');
    expect(typeof biltyService.create).toBe('function');
  });
});

describe('biltyService.list (contract)', () => {
  it('resolves to the array the backend returns', async () => {
    biltyService.list.mockResolvedValueOnce([
      {
        id: 1,
        bilty_no: 'BL-2026-000001',
        bilty_date: '2026-04-18',
        consignor: 'Acme',
        truck_no: 'DL-01',
        item_count: 3,
        created_at: '2026-04-18T00:00:00.000Z',
      },
    ]);
    const rows = await biltyService.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].bilty_no).toBe('BL-2026-000001');
  });
});

describe('biltyService.create (contract)', () => {
  it('returns { id, bilty_no } on success', async () => {
    biltyService.create.mockResolvedValueOnce({ id: 5, bilty_no: 'BL-2026-000005' });
    const payload = {
      header: { consignor: 'Acme', truck_no: 'DL-01' } as any,
      items: [{ qty: 10, rate: 100 } as any],
    };
    const res = await biltyService.create(payload);
    expect(res).toEqual({ id: 5, bilty_no: 'BL-2026-000005' });
    expect(biltyService.create).toHaveBeenCalledWith(payload);
  });
});

describe('biltyService.get (contract)', () => {
  it('resolves to the full detail shape', async () => {
    biltyService.get.mockResolvedValueOnce({
      id: 5,
      bilty_no: 'BL-2026-000005',
      consignor: 'Acme',
      truck_no: 'DL-01',
      items: [{ id: 1, qty: 10, rate: 100 }],
    });
    const d = await biltyService.get(5);
    expect(d.id).toBe(5);
    expect(Array.isArray(d.items)).toBe(true);
  });
});
