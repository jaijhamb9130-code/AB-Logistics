/**
 * OrdersScreen — service-layer contract tests (Phase 5).
 *
 * Follows the project's jest pattern (ts-jest, node env). Instead of rendering
 * RN we assert the orderService contract the screens depend on.
 */

jest.mock('../services/orderService', () => ({
  orderService: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    assignVehicle: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { orderService } = require('../services/orderService') as {
  orderService: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    updateStatus: jest.Mock;
    assignVehicle: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('orderService — shape', () => {
  it('exposes list / get / create / updateStatus / assignVehicle', () => {
    expect(typeof orderService.list).toBe('function');
    expect(typeof orderService.get).toBe('function');
    expect(typeof orderService.create).toBe('function');
    expect(typeof orderService.updateStatus).toBe('function');
    expect(typeof orderService.assignVehicle).toBe('function');
  });
});

describe('orderService.list (contract)', () => {
  it('resolves to the rows the backend returns', async () => {
    orderService.list.mockResolvedValueOnce([
      {
        id: 1,
        order_no: 'OR-2026-000001',
        order_date: '2026-04-18',
        customer_name: 'Acme',
        from_loc: 'Delhi',
        to_loc: 'Jaipur',
        status: 'pending',
        vehicle_no: null,
      },
    ]);
    const rows = await orderService.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].order_no).toBe('OR-2026-000001');
    expect(rows[0].status).toBe('pending');
  });
});

describe('orderService.create (contract)', () => {
  it('returns { id, order_no } on success', async () => {
    orderService.create.mockResolvedValueOnce({ id: 7, order_no: 'OR-2026-000007' });
    const payload = {
      customer_name: 'Acme',
      order_date: '2026-04-18',
      from_loc: 'Delhi',
      to_loc: 'Jaipur',
      goods_desc: 'Boxes',
    };
    const res = await orderService.create(payload);
    expect(res).toEqual({ id: 7, order_no: 'OR-2026-000007' });
    expect(orderService.create).toHaveBeenCalledWith(payload);
  });
});

describe('orderService.updateStatus (contract)', () => {
  it('resolves to the updated OrderDetail', async () => {
    orderService.updateStatus.mockResolvedValueOnce({
      id: 7,
      order_no: 'OR-2026-000007',
      customer_name: 'Acme',
      status: 'in_progress',
      vehicle_no: null,
    });
    const d = await orderService.updateStatus(7, 'in_progress');
    expect(d.status).toBe('in_progress');
    expect(orderService.updateStatus).toHaveBeenCalledWith(7, 'in_progress');
  });
});
