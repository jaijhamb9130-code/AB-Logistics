/**
 * CustomersMasterScreen — Customers tab under Ledger > Ledger Master.
 * Scoped to the "Sundry Debtors" ledger group: lists only customers and lets
 * users create new customers. The Ledger Group dropdown is locked so a
 * customer can never be reclassified into another group from this page.
 *
 * Reuses the shared LedgerMasterFormScreen — see that file for field rules
 * and validation. The group name is resolved to its current numeric id at
 * runtime, so the page survives any DB renumbering of ledger_group rows.
 */
import React from 'react';
import { LedgerMasterFormScreen } from './LedgerMasterFormScreen';

export function CustomersMasterScreen() {
  return (
    <LedgerMasterFormScreen
      groupName="Sundry Debtors"
      title="Customers"
      entityName="Customer"
      lockGroup
      permissionPage="customermaster"
    />
  );
}
