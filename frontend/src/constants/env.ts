/**
 * Frontend environment config.
 * Override via EXPO_PUBLIC_API_URL at build/run time.
 */

// Empty string = relative URLs → Vercel proxy forwards /api/* to Railway.
// Override with EXPO_PUBLIC_API_URL for local dev (e.g. http://localhost:3001).
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? '';
