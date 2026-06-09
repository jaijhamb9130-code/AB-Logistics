/**
 * CustomersMasterScreen — Customers tab under Ledger > Ledger Master.
 * Scoped to the customer child groups: lists both consignor and consignee
 * customers and lets users create either type from one page.
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
      groupName={null}
      title="Customers"
      entityName="Customer"
      permissionPage="customermaster"
      allowedGroupNames={['Consignor', 'Consignee']}
    />
  );
}
