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

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { orderService } from '../services/orderService';
import { validateOrder, type OrderErrors } from '../utils/orderValidation';
import type { OrderListItem, OrderStatus } from '../../../shared/types/order';
import type { OrdersStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'OrderList'>;

const EMPTY_FORM = {
  order_date: '',
  customer_name: '',
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

          <InputField
            label="Customer"
            value={form.customer_name}
            onChangeText={(v) => setForm((f) => ({ ...f, customer_name: v }))}
            error={errs.customer_name ? 'Required' : null}
            testID="customer-input"
          />
          <InputField
            label="Order Date (YYYY-MM-DD, optional)"
            value={form.order_date}
            onChangeText={(v) => setForm((f) => ({ ...f, order_date: v }))}
            placeholder="2026-04-18"
            testID="order-date-input"
          />
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
  title: { ...text.heading, fontSize: 22, lineHeight: 28 },
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
  formScroll: { maxHeight: 500 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.lg, gap: spacing.md,
  },
  cancelBtn: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginRight: spacing.sm,
  },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 160 },
});
