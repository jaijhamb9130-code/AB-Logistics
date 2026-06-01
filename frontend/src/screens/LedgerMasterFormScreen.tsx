/**
 * LedgerMasterFormScreen — shared screen used by LedgerMaster / OwnerMaster /
 * AgentMaster (and any future per-group page). The pages have identical
 * fields (name, GST, PAN, address, city, state, country, pincode); only the
 * `groupName` and labels differ.
 *
 * `groupName` is the ledger_group.group_name to scope this page to (e.g.
 * "Owner", "Agent"). It's resolved to a numeric ledger_group_id at runtime
 * against the loaded groups list, so the frontend never hardcodes ids — any
 * DB state or rename is handled automatically. Pass null for the all-groups
 * view (Ledger Master), which auto-excludes every name in
 * DEDICATED_LEDGER_PAGES so per-group rows only appear on their own page.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { SelectDropdown } from '../components/SelectDropdown';
import { SyncButton } from '../components/SyncButton';
import { colors, radius, spacing, text } from '../constants/theme';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';
import {
  validateGST, validatePAN, validatePincode, validateRequired,
} from '../utils/masterValidators';
import type { LedgerGroupItem } from '../../../shared/types/ledgerGroup';
import type { LedgerMasterItem, LedgerMasterType } from '../../../shared/types/ledgerMaster';
import { DEDICATED_LEDGER_PAGES } from '../constants/dedicatedLedgerPages';
import type { PermissionPage } from '../../../shared/types/user';

const EMPTY_FORM = {
  name: '', gst_no: '', pan_no: '',
  address: '', city: '', state: '', country: '', pincode: '',
  ledger_group_id: 0,
  // New: bill-by-bill toggle + opening balance with Dr/Cr.
  billbybill: 'Yes' as 'Yes' | 'No',
  opening_balance: '',
  opening_balance_type: 'Dr' as 'Dr' | 'Cr',
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

interface Props {
  // null → "all groups" view (Ledger Master). The form defaults new entries to
  // the Sundry Debtors group but lets the user override via the dropdown.
  // Otherwise the ledger_group.group_name to resolve at runtime against the
  // loaded groups list (e.g. "Owner", "Agent"). Lookup is case-insensitive.
  groupName: string | null;
  title: string;
  entityName: string;
  /**
   * When true, the Ledger Group dropdown is replaced with a read-only field
   * showing the page's group, and the user cannot switch to another group.
   * Used by Customers (Sundry Debtors) where the page is, by definition,
   * scoped to a single group. Owner / Agent leave it false so the legacy
   * behaviour (override via dropdown) is preserved.
   */
  lockGroup?: boolean;
  /**
   * The permission module to check for gating. Defaults to 'ledgermaster'.
   * Wrappers (Owner / Agent / Customers) override with their own page key.
   */
  permissionPage?: PermissionPage;
  /**
   * When false, hide Bill by Bill and Opening Balance fields (and don't send
   * those values on save). Used by Agent Master where those accounting fields
   * aren't relevant. Defaults to true.
   */
  showAccountingFields?: boolean;
}

export function LedgerMasterFormScreen({
  groupName, title, entityName, lockGroup = false, permissionPage = 'ledgermaster',
  showAccountingFields = true,
}: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<LedgerMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LedgerMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [groups, setGroups] = useState<LedgerGroupItem[]>([]);

  useEffect(() => {
    ledgerGroupService
      .list()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  // Resolve the page's group_name → numeric id from the loaded groups list.
  // null when groupName is null (all-groups view), undefined while groups
  // are still loading, or null when the name doesn't match anything in DB.
  const resolvedType = useMemo<number | null | undefined>(() => {
    if (groupName == null) return null;
    if (groups.length === 0) return undefined;
    const target = groupName.toLowerCase();
    return groups.find((g) => g.group_name.toLowerCase() === target)?.id ?? null;
  }, [groupName, groups]);

  // For the all-groups view: dynamically resolve every dedicated page name
  // to its current numeric id so those rows are excluded from the list.
  // Missing names are silently skipped — the all-view never breaks.
  const excludeIds = useMemo<number[]>(() => {
    if (groupName != null || groups.length === 0) return [];
    return DEDICATED_LEDGER_PAGES
      .map((name) => {
        const target = name.toLowerCase();
        return groups.find((g) => g.group_name.toLowerCase() === target)?.id;
      })
      .filter((id): id is number => typeof id === 'number');
  }, [groupName, groups]);

  const load = useCallback(async () => {
    // Wait for groups before hitting the list endpoint — we need to know
    // which numeric id corresponds to this page's groupName.
    if (groups.length === 0) return;
    if (groupName != null && resolvedType == null) {
      setListError(
        `${groupName} ledger group not found. Create it via Ledger Groups admin first.`
      );
      setRows([]);
      return;
    }
    setListError(null);
    try {
      const list =
        resolvedType != null
          ? await ledgerMasterService.list(resolvedType)
          : await ledgerMasterService.list(null, { excludeTypes: excludeIds });
      setRows(list);
    } catch {
      setListError(`Could not load ${title.toLowerCase()}.`);
      setRows([]);
    }
  }, [groups.length, groupName, resolvedType, excludeIds, title]);

  useAutoRefresh(load);

  const openCreate = useCallback(() => {
    // For per-group screens (Owner / Agent / future) we default to the
    // resolved group id. For the unified Ledger Master view (groupName=null)
    // we default to Sundry Debtors — the user can switch group via the dropdown.
    const defaultGroupId =
      (resolvedType ?? null) ||
      groups.find((g) => g.group_name.toLowerCase() === 'sundry debtors')?.id ||
      0;
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, ledger_group_id: defaultGroupId });
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, [resolvedType, groups]);

  const openEdit = useCallback((row: LedgerMasterItem) => {
    setEditTarget(row);
    setForm({
      name: row.name ?? '',
      gst_no: row.gst_no ?? '',
      pan_no: row.pan_no ?? '',
      address: row.address ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      country: row.country ?? '',
      pincode: row.pincode ?? '',
      ledger_group_id: row.ledger_group_id ?? (resolvedType ?? 0),
      billbybill: ((row as any).billbybill === 'Yes') ? 'Yes' : 'No',
      opening_balance:
        (row as any).opening_balance != null && Number((row as any).opening_balance) !== 0
          ? String((row as any).opening_balance)
          : '',
      opening_balance_type: ((row as any).opening_balance_type === 'Cr') ? 'Cr' : 'Dr',
    });
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, [resolvedType]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditTarget(null);
  }, []);

  const validate = (s: FormState): FormErrors => {
    const e: FormErrors = {};
    const nameErr = validateRequired(s.name, `${entityName} name`);
    if (nameErr) e.name = nameErr;
    if (!s.ledger_group_id) e.ledger_group_id = 'Ledger group is required.';
    const gstErr = validateGST(s.gst_no);
    if (gstErr) e.gst_no = gstErr;
    const panErr = validatePAN(s.pan_no);
    if (panErr) e.pan_no = panErr;
    const pinErr = validatePincode(s.pincode);
    if (pinErr) e.pincode = pinErr;
    return e;
  };

  const onSubmit = useCallback(async () => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        gst_no: form.gst_no.trim().toUpperCase() || null,
        pan_no: form.pan_no.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        pincode: form.pincode.trim() || null,
        billbybill: (form.billbybill === 'Yes' ? 'Yes' : 'No') as 'Yes' | 'No',
        opening_balance: form.opening_balance.trim() === '' ? 0 : Number(form.opening_balance),
        opening_balance_type: (form.opening_balance_type === 'Cr' ? 'Cr' : 'Dr') as 'Dr' | 'Cr',
        ledger_group_id: form.ledger_group_id || undefined,
      };
      if (editTarget) {
        await ledgerMasterService.update(editTarget.id, payload);
      } else {
        await ledgerMasterService.create({ ...payload, ledger_group_id: form.ledger_group_id });
      }
      await load();
      closeModal();
    } catch (err: any) {

      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        invalid_gst: 'Invalid GST format.',
        invalid_pan: 'Invalid PAN format.',
        invalid_pincode: 'Pincode must be 6 digits.',
        invalid_name: `${entityName} name is required.`,
      };
      setFormError(codeMap[code] || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, load, closeModal, entityName]);

  // Stable string used in testIDs so each per-group page (and the all view)
  // gets a distinct, predictable id namespace regardless of numeric group ids.
  const idPrefix = (groupName ?? 'all').toLowerCase();

  const onSync = async () => {
    await ledgerMasterService.sync();
    Alert.alert('Sync complete', 'Tally sync finished.');
    await load();
  };

  const onDelete = useCallback(async (row: LedgerMasterItem) => {
    // Web prompts via confirm; on native a simple proceed (gated by admin flag
    // anyway). Backend FKs prevent deleting referenced ledgers.
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Delete "${row.name}"? This cannot be undone.`)
        : true;
    if (!ok) return;
    try {
      await ledgerMasterService.delete(row.id);
      await load();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const message =
        code === 'in_use'
          ? 'This ledger is referenced by existing vouchers / bilty rows.'
          : 'Could not delete. Try again.';
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
      } else {
        Alert.alert('Delete failed', message);
      }
    }
  }, [load]);

  const columns: Column<LedgerMasterItem>[] = [
    { key: 'name', label: 'Name', render: (r) => r.name },
    { key: 'gst_no', label: 'GST No', width: 170, render: (r) => r.gst_no || '—' },
    { key: 'pan_no', label: 'PAN', width: 130, render: (r) => r.pan_no || '—' },
    {
      key: 'city', label: 'City / State', width: 200,
      render: (r) => [r.city, r.state].filter(Boolean).join(', ') || '—',
    },
    { key: 'pincode', label: 'Pincode', width: 100, render: (r) => r.pincode || '—' },
    {
      key: 'actions', label: '', width: 140, align: 'right',
      render: (r) => (
        <View style={styles.actionsCell}>
          {canDoAction(user, permissionPage, 'edit') && (
            <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-${idPrefix}-${r.id}`}>
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, permissionPage, 'delete') && (
            <Pressable onPress={() => onDelete(r)} accessibilityRole="button" testID={`delete-${idPrefix}-${r.id}`}>
              <Text style={styles.deleteAction}>Delete</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID={`sync-${idPrefix}-btn`} />
          {canDoAction(user, permissionPage, 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary
                title={`New ${entityName}`}
                onPress={openCreate}
                testID={`new-${idPrefix}-btn`}
              />
            </View>
          )}
        </View>
      </View>

      {listError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{listError}</Text>
        </View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<LedgerMasterItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel={`No entries yet — click New ${entityName} to add one.`}
            testID={`${idPrefix}-table`}
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? `Edit ${entityName}` : `New ${entityName}`}
        testID={`${idPrefix}-modal`}
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label={`${entityName} Name *`}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                error={errs.name ?? null}
                fieldType="letters"
                testID={`${idPrefix}-name-input`}
              />
            </View>
            <View style={styles.rowHalf}>
              {lockGroup ? (
                <InputField
                  label="Ledger Group *"
                  value={groups.find((g) => g.id === form.ledger_group_id)?.group_name ?? (groupName ?? '')}
                  editable={false}
                  testID={`${idPrefix}-group-input`}
                />
              ) : (
                <SelectDropdown
                  label="Ledger Group *"
                  value={groups.find((g) => g.id === form.ledger_group_id)?.group_name ?? ''}
                  options={groups.map((g) => g.group_name)}
                  onSelect={(name) => {
                    const picked = groups.find((g) => g.group_name === name);
                    if (picked) setForm((f) => ({ ...f, ledger_group_id: picked.id }));
                  }}
                  placeholder="Select group..."
                  error={errs.ledger_group_id ?? null}
                  testID={`${idPrefix}-group-input`}
                />
              )}
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="GST No"
                value={form.gst_no}
                onChangeText={(v) => setForm((f) => ({ ...f, gst_no: v.toUpperCase() }))}
                error={errs.gst_no ?? null}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                placeholder="22AAAAA0000A1Z5"
                testID={`${idPrefix}-gst-input`}
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="PAN No"
                value={form.pan_no}
                onChangeText={(v) => setForm((f) => ({ ...f, pan_no: v.toUpperCase() }))}
                error={errs.pan_no ?? null}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                placeholder="AAAAA0000A"
                testID={`${idPrefix}-pan-input`}
              />
            </View>
          </View>
          <InputField
            label="Address"
            value={form.address}
            onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
            testID={`${idPrefix}-address-input`}
          />
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="City"
                value={form.city}
                onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                fieldType="letters"
                testID={`${idPrefix}-city-input`}
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="State"
                value={form.state}
                onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                fieldType="letters"
                testID={`${idPrefix}-state-input`}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Country"
                value={form.country}
                onChangeText={(v) => setForm((f) => ({ ...f, country: v }))}
                fieldType="letters"
                testID={`${idPrefix}-country-input`}
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Pincode"
                value={form.pincode}
                onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))}
                error={errs.pincode ?? null}
                fieldType="integer"
                testID={`${idPrefix}-pincode-input`}
              />
            </View>
          </View>

          {/* Bill by Bill · Opening Balance (amount + Dr/Cr in one box) */}
          {showAccountingFields ? (
          <View style={[styles.row, { alignItems: 'flex-end' }]}>
            {/* Bill by Bill */}
            <View style={styles.rowHalf}>
              <Text style={styles.toggleLabel}>Bill by Bill</Text>
              <View style={[styles.segGroup, { alignSelf: 'stretch' }]}>
                {(['Yes', 'No'] as const).map((opt) => {
                  const active = form.billbybill === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setForm((f) => ({ ...f, billbybill: opt }))}
                      style={[styles.segBtn, active && styles.segBtnActive]}
                      testID={`${idPrefix}-billbybill-${opt.toLowerCase()}`}
                    >
                      <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Opening Balance — amount input + Dr/Cr toggle in a single
                bordered parent box (matches voucher-form aesthetic). */}
            <View style={styles.rowHalf}>
              <Text style={styles.toggleLabel}>Opening Balance</Text>
              <View style={styles.openingBalanceBox}>
                <TextInput
                  value={form.opening_balance === '0' ? '' : form.opening_balance}
                  onChangeText={(v) => {
                    const filtered = v.replace(/[^0-9.]/g, '');
                    setForm((f) => ({ ...f, opening_balance: filtered }));
                  }}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  style={styles.openingBalanceInput}
                  testID={`${idPrefix}-opening-balance-input`}
                />
                <View style={styles.openingBalanceDivider} />
                {(['Dr', 'Cr'] as const).map((opt, idx) => {
                  const active = form.opening_balance_type === opt;
                  const activeStyle =
                    opt === 'Dr' ? styles.segBtnDrActive : styles.segBtnCrActive;
                  const activeText =
                    opt === 'Dr' ? styles.segBtnDrTextActive : styles.segBtnCrTextActive;
                  return (
                    <React.Fragment key={opt}>
                      {idx > 0 ? <View style={styles.openingBalanceDivider} /> : null}
                      <Pressable
                        onPress={() => setForm((f) => ({ ...f, opening_balance_type: opt }))}
                        style={[styles.openingBalancePill, active && activeStyle]}
                        testID={`${idPrefix}-opening-balance-${opt.toLowerCase()}`}
                      >
                        <Text style={[styles.segBtnText, active && activeText]}>
                          {opt}
                        </Text>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID={`${idPrefix}-cancel-btn`}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : `Create ${entityName.toLowerCase()}`}
                onPress={onSubmit}
                loading={saving}
                testID={`${idPrefix}-submit-btn`}
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.lg,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  newBtn: { minWidth: 150 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  formScroll: { maxHeight: 560 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowHalf: { flex: 1 },
  toggleLabel: { fontSize: 12, color: colors.textLabel, marginBottom: 6, fontWeight: '500' },
  segGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    minWidth: 56,
  },
  segBtnActive: {
    backgroundColor: colors.brandRed,
  },
  segBtnText: { color: colors.text, fontWeight: '500', fontSize: 14 },
  segBtnTextActive: { color: '#FFFFFF', fontWeight: '600' },
  // Dr=success green, Cr=brand red — matches voucher form's Dr/Cr pills.
  segBtnDrActive: { backgroundColor: '#F0FDF4', borderColor: colors.success },
  segBtnDrTextActive: { color: colors.success, fontWeight: '700' },
  segBtnCrActive: { backgroundColor: colors.brandRedTone, borderColor: colors.brandRed },
  segBtnCrTextActive: { color: colors.brandRed, fontWeight: '700' },
  // Combined "Opening Balance" parent box: amount input + Dr/Cr in one frame.
  openingBalanceBox: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    minHeight: 44,
  },
  openingBalanceInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
    ...(typeof window !== 'undefined' ? ({ outlineStyle: 'none', borderWidth: 0 } as any) : {}),
  },
  openingBalanceDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  openingBalancePill: {
    flexShrink: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 150 },
  editAction: {
    ...text.action, color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  deleteAction: {
    ...text.action, color: colors.danger,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  actionsCell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
