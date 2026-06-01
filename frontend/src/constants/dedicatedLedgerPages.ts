/**
 * Names of ledger groups that have their own dedicated master page in the
 * UI (e.g. Owner Master, Agent Master). These are looked up against
 * `ledger_group.group_name` at runtime to resolve numeric ids — the
 * frontend no longer hardcodes any specific group id.
 *
 * To add a new dedicated page (e.g. "Driver"):
 *   1. Create the group via the Ledger Groups admin screen.
 *   2. Add the exact name here.
 *   3. Create a screen that renders
 *      <LedgerMasterFormScreen groupName="Driver" title="Driver Master" entityName="Driver" />.
 *
 * The Ledger Master "all" view auto-excludes every name in this list, so
 * those rows only appear on their dedicated page.
 *
 * Name comparison is case-insensitive.
 */
export const DEDICATED_LEDGER_PAGES = ['Owner', 'Agent'] as const;
