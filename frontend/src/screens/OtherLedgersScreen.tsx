/**
 * OtherLedgersScreen — compact bulk-management view for every ledger across
 * every group. Lives under Ledger > Ledger Master > Other Ledgers.
 *
 * Differences vs LedgerMasterFormScreen / CustomersMasterScreen:
 *   - Compact table (S.NO · Name · Group · Bill-by-Bill · Opening Balance · actions).
 *   - Searchbox filters across name and ledger group name.
 *   - Click a row → simplified edit modal that only surfaces the three fields
 *     a bookkeeper typically tweaks in bulk: ledger group, opening balance
 *     (amount + Dr/Cr), and bill-by-bill toggle. Name / GST / address etc.
 *     are left untouched (preserved by sending the existing values back).
 *   - "+ Create Ledger" opens the full new-ledger form for cases where a
 *     fresh ledger needs to be added with all the usual fields.
 *   - Delete action (admin-only) — backend FK constraints block deletion of
 *     ledgers referenced by vouchers / bilty rows.
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
import { colors, radius, spacing, text } from '../constants/theme';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';
import { useResponsive } from '../hooks/useResponsive';
import { validateRequired } from '../utils/masterValidators';
import type { LedgerGroupItem } from '../../../shared/types/ledgerGroup';
import type { LedgerMasterItem } from '../../../shared/types/ledgerMaster';

// ── Edit modal: only the three fields a bookkeeper wants in bulk ───────────
interface EditState {
  ledger_group_id: number;
  billbybill: 'Yes' | 'No';
  opening_balance: string;
  opening_balance_type: 'Dr' | 'Cr';
}
const EMPTY_EDIT: EditState = {
  ledger_group_id: 0,
  billbybill: 'Yes',
  opening_balance: '',
  opening_balance_type: 'Dr',
};

// ── Create modal: simplified — bookkeepers only need name + group + opening
//                 balance + bill-by-bill from this page. Anything richer
//                 (GST / PAN / address) is added later via the per-row Edit
//                 flow on whichever page the ledger belongs to. ──────────
const EMPTY_CREATE = {
  name: '',
  ledger_group_id: 0,
  billbybill: 'No' as 'Yes' | 'No',
  opening_balance: '',
  opening_balance_type: 'Dr' as 'Dr' | 'Cr',
};
type CreateState = typeof EMPTY_CREATE;
type CreateErrors = Partial<Record<keyof CreateState, string>>;

export function OtherLedgersScreen() {
  const { user } = useAuth();
  const { isMobile } = useResponsive();

  const [rows, setRows] = useState<LedgerMasterItem[] | null>(null);
  const [groups, setGroups] = useState<LedgerGroupItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Edit (compact) modal state
  const [editTarget, setEditTarget] = useState<LedgerMasterItem | null>(null);
  const [editForm, setEditForm] = useState<EditState>(EMPTY_EDIT);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Create (full) modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateState>(EMPTY_CREATE);
  const [createErrs, setCreateErrs] = useState<CreateErrors>({});
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    ledgerGroupService.list().then(setGroups).catch(() => setGroups([]));
  }, []);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const list = await ledgerMasterService.list(null);
      setRows(list);
    } catch {
      setListError('Could not load ledgers.');
      setRows([]);
    }
  }, []);
  useAutoRefresh(load);

  // Build a quick id → group_name lookup so the table column can render the
  // group name without an extra service round-trip per row.
  const groupNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups) m.set(g.id, g.group_name);
    return m;
  }, [groups]);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const groupName = (groupNameById.get(r.ledger_group_id ?? -1) ?? '').toLowerCase();
      return r.name.toLowerCase().includes(q) || groupName.includes(q);
    });
  }, [rows, search, groupNameById]);

  // ── Edit (compact) ────────────────────────────────────────────────────────
  const openEdit = useCallback((row: LedgerMasterItem) => {
    setEditTarget(row);
    const ob = (row as any).opening_balance;
    setEditForm({
      ledger_group_id: row.ledger_group_id ?? 0,
      billbybill: ((row as any).billbybill === 'No') ? 'No' : 'Yes',
      opening_balance: ob != null && Number(ob) !== 0 ? String(ob) : '',
      opening_balance_type: ((row as any).opening_balance_type === 'Cr') ? 'Cr' : 'Dr',
    });
    setEditError(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditTarget(null);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editTarget) return;
    if (!editForm.ledger_group_id) {
      setEditError('Pick a ledger group.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      // PUT requires the full row shape (name + address fields are
      // re-validated server-side). We send the existing values for those so
      // the bulk-edit only changes group / opening balance / bill-by-bill.
      await ledgerMasterService.update(editTarget.id, {
        name: editTarget.name,
        gst_no: editTarget.gst_no ?? null,
        pan_no: editTarget.pan_no ?? null,
        address: editTarget.address ?? null,
        city: editTarget.city ?? null,
        state: editTarget.state ?? null,
        country: editTarget.country ?? null,
        pincode: editTarget.pincode ?? null,
        ledger_group_id: editForm.ledger_group_id,
        billbybill: editForm.billbybill,
        opening_balance:
          editForm.opening_balance.trim() === '' ? 0 : Number(editForm.opening_balance),
        opening_balance_type: editForm.opening_balance_type,
      });
      await load();
      closeEdit();
    } catch {
      setEditError('Could not save. Try again.');
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editForm, load, closeEdit]);

  // ── Delete (admin-only) ──────────────────────────────────────────────────
  const onDelete = useCallback(async (row: LedgerMasterItem) => {
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

  // Resolve the dedicated customer child groups so we can block creation
  // here and steer the user to their full pages. Done at runtime so the page
  // survives any DB renumbering of ledger_group rows.
  const dedicatedCustomerGroupIds = useMemo(() => {
    return groups
      .filter((g) => ['consignor', 'consignee'].includes(g.group_name.toLowerCase()))
      .map((g) => g.id);
  }, [groups]);

  // ── Create (simplified) ───────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setCreateForm({ ...EMPTY_CREATE });
    setCreateErrs({});
    setCreateError(null);
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateError(null);
  }, []);

  const validateCreate = (s: CreateState): CreateErrors => {
    const e: CreateErrors = {};
    const nameErr = validateRequired(s.name, 'Ledger name');
    if (nameErr) e.name = nameErr;
    if (!s.ledger_group_id) e.ledger_group_id = 'Ledger group is required.';
    return e;
  };

  const submitCreate = useCallback(async () => {
    const errs = validateCreate(createForm);
    setCreateErrs(errs);
    if (Object.keys(errs).length > 0) return;
    // Block customers from being created from this page — they must be made
    // on the Customers tab where the full GST / PAN / address form lives.
    if (dedicatedCustomerGroupIds.includes(createForm.ledger_group_id)) {
      setCreateError('Consignor and Consignee customers must be created from their dedicated pages.');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await ledgerMasterService.create({
        name: createForm.name.trim(),
        // Address fields are intentionally null here — bookkeepers only need
        // group + balance + bill-by-bill on this page. Add them later via
        // per-row edit on the relevant master page.
        gst_no: null,
        pan_no: null,
        address: null,
        city: null,
        state: null,
        country: null,
        pincode: null,
        billbybill: createForm.billbybill,
        opening_balance:
          createForm.opening_balance.trim() === '' ? 0 : Number(createForm.opening_balance),
        opening_balance_type: createForm.opening_balance_type,
        ledger_group_id: createForm.ledger_group_id,
      });
      await load();
      closeCreate();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        invalid_name: 'Ledger name is required.',
      };
      setCreateError(codeMap[code] || 'Could not save. Try again.');
    } finally {
      setCreateSaving(false);
    }
  }, [createForm, dedicatedCustomerGroupIds, load, closeCreate]);

  // ── Table ─────────────────────────────────────────────────────────────────
  // DataTable auto-prepends an S.No column, so we don't add one here.
  const columns: Column<LedgerMasterItem>[] = [
    { key: 'name', label: 'Name', render: (r) => r.name },
    {
      key: 'group', label: 'Ledger Group', width: 220,
      render: (r) => groupNameById.get(r.ledger_group_id ?? -1) ?? '—'
    },
    {
      key: 'billbybill', label: 'Bill by Bill', width: 110, align: 'center',
      render: (r) => ((r as any).billbybill === 'No' ? 'No' : 'Yes')
    },
    {
      key: 'opening', label: 'Opening Balance', width: 160, align: 'right',
      render: (r) => {
        const v = Number((r as any).opening_balance ?? 0);
        if (!v) return <Text style={styles.muted}>—</Text>;
        const t = (r as any).opening_balance_type === 'Cr' ? 'Cr' : 'Dr';
        // Dr = green (debit / positive for assets), Cr = red (credit). Same
        // colour story used by the Dr/Cr pills in the form for consistency.
        const colorStyle = t === 'Dr' ? styles.amountDr : styles.amountCr;
        return <Text style={[styles.amountValue, colorStyle]}>{v.toFixed(2)} {t}</Text>;
      },
    },
    {
      key: 'actions', label: '', width: 140, align: 'right',
      render: (r) => (
        <View style={styles.actionsCell}>
          {canDoAction(user, 'ledgermaster', 'edit') && (
            <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-other-${r.id}`}>
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, 'ledgermaster', 'delete') && (
            <Pressable onPress={() => onDelete(r)} accessibilityRole="button" testID={`delete-other-${r.id}`}>
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
        <Text style={styles.title}>Ledgers</Text>
        <View style={styles.headerActions}>
          {/* The "click any row" hint is desktop-only — on mobile it squeezes
              into an unreadable column, and the cards already show Edit buttons. */}
          {!isMobile ? (
            <Text style={styles.headerHint}>
              Click any row to edit its <Text style={styles.headerHintBold}>group</Text>{' '}
              or <Text style={styles.headerHintBold}>opening balance</Text>.
            </Text>
          ) : null}
          {canDoAction(user, 'ledgermaster', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary title="+ Create Ledger" onPress={openCreate} testID="new-other-btn" />
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search ledgers / groups..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="other-ledgers-search"
        />
      </View>

      {listError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{listError}</Text>
        </View>
      ) : null}

      {visibleRows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<LedgerMasterItem>
            columns={columns}
            rows={visibleRows}
            keyExtractor={(r) => r.id}
            emptyLabel="No ledgers yet."
            testID="other-ledgers-table"
          />
        </View>
      )}

      {/* ── Edit modal — simplified ─────────────────────────────────────── */}
      <Modal
        visible={editTarget !== null}
        onClose={closeEdit}
        title="Edit Ledger"
        testID="other-edit-modal"
      >
        {editTarget ? (
          <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
            <Text style={styles.editSubtitle}>{editTarget.name}</Text>

            {editError ? (
              <View style={styles.formError}>
                <Text style={styles.formErrorText}>{editError}</Text>
              </View>
            ) : null}

            <SelectDropdown
              label="Ledger Group *"
              value={groups.find((g) => g.id === editForm.ledger_group_id)?.group_name ?? ''}
              options={groups.map((g) => g.group_name)}
              onSelect={(name) => {
                const picked = groups.find((g) => g.group_name === name);
                if (picked) setEditForm((f) => ({ ...f, ledger_group_id: picked.id }));
              }}
              placeholder="Select group..."
              testID="other-edit-group"
            />

            <Text style={styles.toggleLabel}>Opening Balance</Text>
            <View style={styles.openingBalanceBox}>
              <TextInput
                value={editForm.opening_balance === '0' ? '' : editForm.opening_balance}
                onChangeText={(v) =>
                  setEditForm((f) => ({ ...f, opening_balance: v.replace(/[^0-9.]/g, '') }))
                }
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                style={styles.openingBalanceInput}
                testID="other-edit-amount"
              />
              <View style={styles.openingBalanceDivider} />
              {(['Dr', 'Cr'] as const).map((opt, idx) => {
                const active = editForm.opening_balance_type === opt;
                const activeStyle = opt === 'Dr' ? styles.segBtnDrActive : styles.segBtnCrActive;
                const activeText = opt === 'Dr' ? styles.segBtnDrTextActive : styles.segBtnCrTextActive;
                return (
                  <React.Fragment key={opt}>
                    {idx > 0 ? <View style={styles.openingBalanceDivider} /> : null}
                    <Pressable
                      onPress={() => setEditForm((f) => ({ ...f, opening_balance_type: opt }))}
                      style={[styles.openingBalancePill, active && activeStyle]}
                      testID={`other-edit-${opt.toLowerCase()}`}
                    >
                      <Text style={[styles.segBtnText, active && activeText]}>{opt}</Text>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>

            <Text style={styles.toggleLabel}>Bill by Bill</Text>
            <View style={[styles.segGroup, { alignSelf: 'flex-start', marginBottom: spacing.md }]}>
              {(['Yes', 'No'] as const).map((opt) => {
                const active = editForm.billbybill === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setEditForm((f) => ({ ...f, billbybill: opt }))}
                    style={[styles.segBtn, active && styles.segBtnActive]}
                    testID={`other-edit-billbybill-${opt.toLowerCase()}`}
                  >
                    <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable onPress={closeEdit} style={styles.cancelBtn} testID="other-edit-cancel">
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <View style={styles.submitWrap}>
                <ButtonPrimary
                  title="Save"
                  onPress={saveEdit}
                  loading={editSaving}
                  testID="other-edit-save"
                />
              </View>
            </View>
          </ScrollView>
        ) : null}
      </Modal>

      {/* ── Create modal — simplified (matches user spec) ──────────────── */}
      <Modal
        visible={createOpen}
        onClose={closeCreate}
        title="Create Ledger"
        testID="other-create-modal"
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          <Text style={styles.createSubtitle}>
            Sundry Debtors must be created from the Customers page.
          </Text>

          {createError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{createError}</Text>
            </View>
          ) : null}

          <InputField
            label="Name *"
            value={createForm.name}
            onChangeText={(v) => setCreateForm((f) => ({ ...f, name: v }))}
            error={createErrs.name ?? null}
            placeholder="e.g. Bank Charges, Office Rent..."
            testID="other-create-name"
          />

          <SelectDropdown
            label="Ledger Group *"
            value={groups.find((g) => g.id === createForm.ledger_group_id)?.group_name ?? ''}
            options={groups.map((g) => g.group_name)}
            onSelect={(name) => {
              const picked = groups.find((g) => g.group_name === name);
              if (picked) setCreateForm((f) => ({ ...f, ledger_group_id: picked.id }));
            }}
            placeholder="Search & select group..."
            error={createErrs.ledger_group_id ?? null}
            searchable
            testID="other-create-group"
          />

          <Text style={styles.toggleLabel}>Opening Balance</Text>
          <View style={styles.openingBalanceBox}>
            <TextInput
              value={createForm.opening_balance === '0' ? '' : createForm.opening_balance}
              onChangeText={(v) =>
                setCreateForm((f) => ({ ...f, opening_balance: v.replace(/[^0-9.]/g, '') }))
              }
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              style={styles.openingBalanceInput}
              testID="other-create-amount"
            />
            <View style={styles.openingBalanceDivider} />
            {(['Dr', 'Cr'] as const).map((opt, idx) => {
              const active = createForm.opening_balance_type === opt;
              const activeStyle = opt === 'Dr' ? styles.segBtnDrActive : styles.segBtnCrActive;
              const activeText = opt === 'Dr' ? styles.segBtnDrTextActive : styles.segBtnCrTextActive;
              return (
                <React.Fragment key={opt}>
                  {idx > 0 ? <View style={styles.openingBalanceDivider} /> : null}
                  <Pressable
                    onPress={() => setCreateForm((f) => ({ ...f, opening_balance_type: opt }))}
                    style={[styles.openingBalancePill, active && activeStyle]}
                    testID={`other-create-${opt.toLowerCase()}`}
                  >
                    <Text style={[styles.segBtnText, active && activeText]}>{opt}</Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>

          <Text style={styles.toggleLabel}>Bill by Bill</Text>
          <Text style={styles.subLabel}>Track outstanding per invoice for this ledger.</Text>
          <View style={[styles.segGroup, { alignSelf: 'flex-start', marginBottom: spacing.md }]}>
            {(['Yes', 'No'] as const).map((opt) => {
              const active = createForm.billbybill === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setCreateForm((f) => ({ ...f, billbybill: opt }))}
                  style={[styles.segBtn, active && styles.segBtnActive]}
                  testID={`other-create-billbybill-${opt.toLowerCase()}`}
                >
                  <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={closeCreate} style={styles.cancelBtn} testID="other-create-cancel">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title="Create"
                onPress={submitCreate}
                loading={createSaving}
                testID="other-create-save"
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
    justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.md,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  headerHint: { ...text.label, color: colors.textMuted, flexShrink: 1 },
  headerHintBold: { color: colors.text, fontWeight: '600' },
  newBtn: { minWidth: 160 },

  searchWrap: { marginBottom: spacing.md },
  searchInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.card, fontSize: 14, color: colors.text,
    ...(typeof window !== 'undefined' ? ({ outlineStyle: 'none' } as any) : {}),
  },

  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  snoText: { ...text.value, color: colors.textMuted },
  muted: { color: colors.textMuted },
  amountValue: { fontWeight: '700', color: colors.text },
  amountDr: { color: colors.success },
  amountCr: { color: colors.brandRed },

  // ── Modal shared ────────────────────────────────────────────────────────
  formScroll: { maxHeight: 560 },
  formContent: { paddingBottom: spacing.sm },
  editSubtitle: { ...text.label, color: colors.textMuted, marginBottom: spacing.sm },
  createSubtitle: {
    ...text.label, color: colors.warning ?? colors.brandRed,
    marginBottom: spacing.sm, fontWeight: '600',
  },
  subLabel: {
    fontSize: 11, color: colors.textMuted, marginTop: -2, marginBottom: 4,
  },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowHalf: { flex: 1 },

  // ── Toggles ─────────────────────────────────────────────────────────────
  toggleLabel: { fontSize: 12, color: colors.textLabel, marginBottom: 4, fontWeight: '500' },
  segGroup: {
    flexDirection: 'row', borderWidth: 1, borderColor: '#CBD5E1',
    borderRadius: radius.md, overflow: 'hidden',
  },
  segBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', alignItems: 'center', minWidth: 56,
  },
  segBtnActive: { backgroundColor: colors.brandRed },
  segBtnText: { color: colors.text, fontWeight: '500', fontSize: 14 },
  segBtnTextActive: { color: '#FFFFFF', fontWeight: '600' },
  segBtnDrActive: { backgroundColor: '#F0FDF4', borderColor: colors.success },
  segBtnDrTextActive: { color: colors.success, fontWeight: '700' },
  segBtnCrActive: { backgroundColor: colors.brandRedTone, borderColor: colors.brandRed },
  segBtnCrTextActive: { color: colors.brandRed, fontWeight: '700' },

  openingBalanceBox: {
    flexDirection: 'row', alignItems: 'stretch',
    borderWidth: 1, borderColor: '#CBD5E1', borderRadius: radius.md,
    backgroundColor: '#FFFFFF', overflow: 'hidden', minHeight: 44,
    marginBottom: spacing.sm,
  },
  openingBalanceInput: {
    flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.text, fontWeight: '700',
    ...(typeof window !== 'undefined' ? ({ outlineStyle: 'none', borderWidth: 0 } as any) : {}),
  },
  openingBalanceDivider: { width: 1, backgroundColor: '#E2E8F0' },
  openingBalancePill: {
    flexShrink: 0, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', minWidth: 50,
  },

  // ── Actions ─────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 160 },

  // ── Row actions ─────────────────────────────────────────────────────────
  actionsCell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  editAction: {
    ...text.action, color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  deleteAction: {
    ...text.action, color: colors.danger,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
});
