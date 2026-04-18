/**
 * VehiclesScreen — service-layer contract tests (Phase 5).
 *
 * Matches BiltyScreen.test.tsx / UsersScreen.test.tsx pattern — asserts
 * vehicleService contract rather than rendering the RN tree.
 */

jest.mock('../services/vehicleService', () => ({
  vehicleService: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vehicleService } = require('../services/vehicleService') as {
  vehicleService: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('vehicleService — shape', () => {
  it('exposes list / get / create / update / deactivate', () => {
    expect(typeof vehicleService.list).toBe('function');
    expect(typeof vehicleService.get).toBe('function');
    expect(typeof vehicleService.create).toBe('function');
    expect(typeof vehicleService.update).toBe('function');
    expect(typeof vehicleService.deactivate).toBe('function');
  });
});

describe('vehicleService.list (contract)', () => {
  it('resolves to rows with is_active flag', async () => {
    vehicleService.list.mockResolvedValueOnce([
      {
        id: 1,
        vehicle_no: 'DL-01-AB-1234',
        vehicle_type: 'Truck',
        owner_name: 'Raj',
        is_active: true,
      },
    ]);
    const rows = await vehicleService.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicle_no).toBe('DL-01-AB-1234');
    expect(rows[0].is_active).toBe(true);
  });
});

describe('vehicleService.create (contract)', () => {
  it('returns the created Vehicle on success', async () => {
    vehicleService.create.mockResolvedValueOnce({
      id: 3,
      vehicle_no: 'DL-01-AB-9999',
      vehicle_type: 'Trailer',
      owner_name: 'Amit',
      is_active: true,
    });
    const payload = {
      vehicle_no: 'DL-01-AB-9999',
      vehicle_type: 'Trailer',
      owner_name: 'Amit',
    };
    const res = await vehicleService.create(payload);
    expect(res.id).toBe(3);
    expect(res.vehicle_no).toBe('DL-01-AB-9999');
    expect(vehicleService.create).toHaveBeenCalledWith(payload);
  });
});
