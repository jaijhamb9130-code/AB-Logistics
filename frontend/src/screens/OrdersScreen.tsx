/**
 * OrdersScreen — list of orders + "New Order" modal create flow
 * (Phase 5 / ORDER-01, ORDER-02).
 *
 * DataTable columns: order_no, date, customer, from→to, status pill,
 * vehicle_no or "—", actions (View).
 *
 * Row-tap + View both navigate to OrderDetail. Status pill colors:
 *   pending     → grey (textMuted)
 *   in_progress → yellow tone (brand)
 *   completed   → green (success)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { getTodayISO } from '../utils/dateUtils';
import { orderService } from '../services/orderService';
import { customerService } from '../services/customerService';
import { validateOrder, type OrderErrors } from '../utils/orderValidation';
import type { OrderListItem, OrderStatus } from '../../../shared/types/order';
import type { CustomerSearchResult } from '../../../shared/types/customer';
import type { OrdersStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'OrderList'>;

const EMPTY_FORM = {
  order_date: getTodayISO(),
  customer_name: '',
  customer_id: null as number | null,
  from_loc: '',
  to_loc: '',
  goods_desc: '',
};


const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function statusStyles(status: OrderStatus) {
  if (status === 'completed') return { bg: 'rgba(34,197,94,0.12)', fg: colors.success };
  if (status === 'in_progress') return { bg: colors.brandYellowTone, fg: colors.brandBlack };
  return { bg: 'rgba(100,116,139,0.12)', fg: colors.textMuted };
}

export function OrdersScreen() {
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<OrderListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errs, setErrs] = useState<OrderErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const list = await orderService.list();
      setRows(list);
    } catch {
      setListError('Could not load orders. Try again.');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openModal = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  const onSubmit = useCallback(async () => {
    const v = validateOrder(form);
    setErrs(v);
    if (Object.keys(v).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await orderService.create({
        order_date: form.order_date || null,
        customer_name: form.customer_name.trim(),
        customer_id: form.customer_id ?? undefined,
        from_loc: form.from_loc || null,
        to_loc: form.to_loc || null,
        goods_desc: form.goods_desc || null,
      });
      await load();
      closeModal();
    } catch {
      setFormError('Could not create order. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, load, closeModal]);

  const columns: Column<OrderListItem>[] = [
    { key: 'order_no', label: 'Order No', width: 160, render: (r) => r.order_no },
    { key: 'order_date', label: 'Date', width: 110, render: (r) => formatDate(r.order_date) },
    { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name },
    {
      key: 'route', label: 'Route', width: 180,
      render: (r) => `${r.from_loc ?? '—'} → ${r.to_loc ?? '—'}`,
    },
    {
      key: 'status', label: 'Status', width: 130,
      render: (r) => {
        const s = statusStyles(r.status);
        return (
          <View style={[styles.pill, { backgroundColor: s.bg }]} testID={`status-pill-${r.id}`}>
            <Text style={[styles.pillText, { color: s.fg }]}>{STATUS_LABELS[r.status]}</Text>
          </View>
        );
      },
    },
    { key: 'vehicle_no', label: 'Vehicle', width: 140, render: (r) => r.vehicle_no || '—' },
    {
      key: 'actions', label: '', width: 90, align: 'right',
      render: (r) => (
        <Pressable
          onPress={() => navigation.navigate('OrderDetail', { id: r.id })}
          accessibilityRole="button"
          accessibilityLabel={`View ${r.order_no}`}
          testID={`view-order-${r.id}`}
        >
          <Text style={styles.viewAction}>View</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.headerBtn}>
          <ButtonPrimary title="New Order" onPress={openModal} testID="new-order-btn" />
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
          <DataTable<OrderListItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            onRowPress={(r) => navigation.navigate('OrderDetail', { id: r.id })}
            emptyLabel="No orders yet — click New Order to create one."
            testID="orders-table"
          />
        </View>
      )}

      <Modal visible={modalOpen} onClose={closeModal} title="New Order" testID="order-modal">
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.formRow}>
            <View style={styles.formRowCustomer}>
              <CustomerAutocomplete
                value={form.customer_name}
                error={errs.customer_name ? 'Required' : null}
                onSelect={(name, id) => setForm((f) => ({ ...f, customer_name: name, customer_id: id }))}
                onChange={(v) => setForm((f) => ({ ...f, customer_name: v, customer_id: null }))}
              />
            </View>
            <View style={styles.formRowDate}>
              <InputField
                label="Date"
                value={form.order_date}
                onChangeText={(v) => setForm((f) => ({ ...f, order_date: v }))}
                placeholder="YYYY-MM-DD"
                testID="order-date-input"
              />
            </View>
          </View>
          <InputField
            label="From (optional)"
            value={form.from_loc}
            onChangeText={(v) => setForm((f) => ({ ...f, from_loc: v }))}
            testID="order-from-input"
          />
          <InputField
            label="To (optional)"
            value={form.to_loc}
            onChangeText={(v) => setForm((f) => ({ ...f, to_loc: v }))}
            testID="order-to-input"
          />
          <InputField
            label="Goods description (optional)"
            value={form.goods_desc}
            onChangeText={(v) => setForm((f) => ({ ...f, goods_desc: v }))}
            testID="order-goods-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="order-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title="Create order"
                onPress={onSubmit}
                loading={submitting}
                testID="order-submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

function CustomerAutocomplete({
  value,
  error,
  onSelect,
  onChange,
}: {
  value: string;
  error?: string | null;
  onSelect: (name: string, id: number) => void;
  onChange: (v: string) => void;
}) {
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    onChange(v);
    if (debounce.current) clearTimeout(debounce.current);
    if (v.trim().length < 1) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const res = await customerService.search(v.trim());
        setResults(res);
        setOpen(res.length > 0);
      } catch {
        setResults([]); setOpen(false);
      }
    }, 220);
  };

  const pick = (r: CustomerSearchResult) => {
    onSelect(r.name, r.id);
    setOpen(false);
    setResults([]);
  };

  const borderColor = error ? colors.danger : focused ? colors.brandRed : '#E2E8F0';

  return (
    <View style={[acStyles.wrap, open && acStyles.wrapOpen]}>
      <Text style={acStyles.label}>Customer *</Text>
      <View style={[
        acStyles.inputRow,
        { borderColor, borderWidth: focused ? 2 : 1.5 },
        focused && Platform.OS === 'web' && ({ boxShadow: '0 0 0 3px rgba(247, 72, 61, 0.15)' } as any),
      ]}>
        <TextInput
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Type to search customers…"
          placeholderTextColor={colors.textMuted}
          style={[acStyles.input, Platform.OS === 'web' && ({ outline: 'none' } as any)]}
          testID="customer-input"
        />
      </View>
      {error ? <Text style={acStyles.errorText}>{error}</Text> : null}
      {open && (
        <View style={acStyles.dropdown}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {results.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => pick(r)}
                style={({ pressed }) => [acStyles.dropRow, pressed && acStyles.dropRowPressed]}
              >
                <Text style={acStyles.dropName} numberOfLines={1}>{r.name}</Text>
                {r.city ? <Text style={acStyles.dropSub}>{r.city}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const acStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm, zIndex: 10 },
  wrapOpen: { zIndex: 999 },
  label: {
    fontSize: 12, color: colors.textLabel, marginBottom: 3,
    fontFamily: typography.uiBold, letterSpacing: 0.2,
  },
  inputRow: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.ui,
  },
  errorText: {
    marginTop: spacing.xs, fontSize: 13,
    color: colors.danger, fontFamily: typography.ui,
  },
  dropdown: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    maxHeight: 180,
    marginTop: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dropRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dropRowPressed: { backgroundColor: '#F8FAFC' },
  dropName: { color: colors.text, fontFamily: typography.uiBold, fontSize: 14, flex: 1 },
  dropSub: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 12 },
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.lg,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  headerBtn: { minWidth: 140 },
  tableWrap: { flex: 1, minHeight: 200 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  pillText: { ...text.pill },
  viewAction: {
    ...text.action,
    color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  formRowCustomer: { flex: 1 },
  formRowDate: { width: 130 },
  formScroll: { maxHeight: 500 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 130 },
});
