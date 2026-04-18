import { validateVehicle, validateVehicleNo } from './vehicleValidation';

describe('vehicleValidation', () => {
  it('accepts a typical Indian plate like DL-01-AB-1234', () => {
    expect(validateVehicleNo('DL-01-AB-1234')).toBeNull();
  });

  it('flags empty vehicle_no as required', () => {
    expect(validateVehicleNo('')).toBe('required');
    expect(validateVehicleNo('   ')).toBe('required');
  });

  it('flags disallowed characters as invalid_format', () => {
    expect(validateVehicleNo('DL-01/AB*1234')).toBe('invalid_format');
  });

  it('validateVehicle returns empty object on valid input', () => {
    expect(validateVehicle({ vehicle_no: 'DL-01-AB-1234', vehicle_type: '10-wheeler', owner_name: 'John' })).toEqual({});
  });
});
