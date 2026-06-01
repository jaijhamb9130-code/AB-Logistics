/**
 * LedgerMasterScreen — page wrapper around the shared LedgerMasterFormScreen.
 * Renders ALL ledger groups (no per-group filter). New entries default to the
 * Sundry Debtors group; the user can pick any group via the dropdown.
 *
 * The shared form/list lives in `./LedgerMasterFormScreen` and is reused by
 * OwnerMasterScreen (groupName="Owner") and AgentMasterScreen
 * (groupName="Agent") for the per-group views. The numeric ledger_group_id
 * is resolved from the loaded groups list at runtime — no hardcoded ids.
 *
 * The list of dedicated per-group pages auto-excluded from this view lives
 * in `frontend/src/constants/dedicatedLedgerPages.ts`.
 */
import React from 'react';
import { LedgerMasterFormScreen } from './LedgerMasterFormScreen';

export function LedgerMasterScreen() {
  return <LedgerMasterFormScreen groupName={null} title="Ledger Master" entityName="Ledger" permissionPage="ledgermaster" />;
}
