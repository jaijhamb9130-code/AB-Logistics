import { canAdvance, nextStatus, validateOrder } from './orderValidation';

describe('orderValidation', () => {
  it('accepts valid payload with customer_name', () => {
    expect(validateOrder({ customer_name: 'Acme' })).toEqual({});
  });

  it('flags missing customer_name', () => {
    expect(validateOrder({ customer_name: '' })).toEqual({ customer_name: 'required' });
    expect(validateOrder({ customer_name: '   ' })).toEqual({ customer_name: 'required' });
  });

  it('nextStatus follows pending → in_progress → completed → null', () => {
    expect(nextStatus('pending')).toBe('in_progress');
    expect(nextStatus('in_progress')).toBe('completed');
    expect(nextStatus('completed')).toBeNull();
  });

  it('canAdvance is false only when already completed', () => {
    expect(canAdvance('pending')).toBe(true);
    expect(canAdvance('in_progress')).toBe(true);
    expect(canAdvance('completed')).toBe(false);
  });
});
