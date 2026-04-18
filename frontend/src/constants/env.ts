/**
 * Frontend environment config.
 * Override via EXPO_PUBLIC_API_URL at build/run time.
 */

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
