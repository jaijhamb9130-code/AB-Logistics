/**
 * FreightMemoScreen — service-layer contract tests (Phase 4).
 *
 * Matches the project's existing ts-jest + node env setup (see
 * BiltyScreen.test.tsx for prior art). We exercise the service the screen
 * consumes rather than rendering the RN tree.
 */

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
  freightService: {
    list: jest.Mock;
    get: jest.Mock;
    generate: jest.Mock;
    getByBiltyId: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('freightService — shape', () => {
  it('exposes list / get / generate / getByBiltyId', () => {
    expect(typeof freightService.list).toBe('function');
    expect(typeof freightService.get).toBe('function');
    expect(typeof freightService.generate).toBe('function');
    expect(typeof freightService.getByBiltyId).toBe('function');
  });
});

describe('freightService.list (contract)', () => {
  it('resolves to the array the backend returns', async () => {
    freightService.list.mockResolvedValueOnce([
      {
        id: 1,
        memo_no: 'FM-2026-000001',
        bilty_id: 5,
        memo_date: '2026-04-18',
        freight_total: 1000,
        net_payable: 1000,
        generated_by: 1,
        created_at: '2026-04-18T00:00:00.000Z',
        bilty_no: 'BL-2026-000005',
        consignor: 'Acme',
        truck_no: 'DL-01',
      },
    ]);
    const rows = await freightService.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].memo_no).toBe('FM-2026-000001');
    expect(rows[0].bilty_no).toBe('BL-2026-000005');
  });
});

describe('freightService.generate (contract)', () => {
  it('posts { bilty_id } and returns the generated memo', async () => {
    freightService.generate.mockResolvedValueOnce({
      id: 9,
      memo_no: 'FM-2026-000001',
      bilty_id: 5,
      memo_date: '2026-04-18',
      freight_total: 1000,
      net_payable: 1000,
    });
    const memo = await freightService.generate(5);
    expect(freightService.generate).toHaveBeenCalledWith(5);
    expect(memo).toEqual(
      expect.objectContaining({ id: 9, memo_no: 'FM-2026-000001', bilty_id: 5 })
    );
  });

  it('propagates 409 memo_exists so the screen can route to existing', async () => {
    freightService.generate.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'memo_exists' } },
    });
    await expect(freightService.generate(5)).rejects.toMatchObject({
      response: { status: 409 },
    });
  });
});

describe('freightService.getByBiltyId (contract)', () => {
  it('resolves to the frozen memo row for the given bilty', async () => {
    freightService.getByBiltyId.mockResolvedValueOnce({
      id: 9,
      memo_no: 'FM-2026-000001',
      bilty_id: 5,
      memo_date: '2026-04-18',
      freight_total: 1000,
      net_payable: 1000,
      generated_by: 1,
      created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    });
    const row = await freightService.getByBiltyId(5);
    expect(row.id).toBe(9);
    expect(row.bilty_id).toBe(5);
  });
});
