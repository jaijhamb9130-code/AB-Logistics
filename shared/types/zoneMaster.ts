/**
 * Zone Master types — minimal name-only master used by Bilty header.
 */

export interface ZoneMasterItem {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateZoneRequest {
  name: string;
  description?: string | null;
}

export interface UpdateZoneRequest {
  name: string;
  description?: string | null;
}
