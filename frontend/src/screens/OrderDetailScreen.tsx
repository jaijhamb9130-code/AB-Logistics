/**
 * OrderDetailScreen — view + Advance Status + Assign Vehicle (Phase 5).
 *
 * Shows header fields, status pill, and current vehicle (if any). Two action
 * buttons for users with order.edit:
 *   - "Advance Status"  — disabled when status=completed. Calls PATCH /status.
 *   - "Assign Vehicle"  — opens a modal picker listing active vehicles.
 *
 * Permission gating is purely UX — backend enforces order.edit per route.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, typography } from '../constants/theme';
import { orderService } from '../services/orderService';
import { vehicleService } from '../services/vehicleService';
import { canAdvance, nextStatus } from '../utils/orderValidation';
import type { OrderDetail, OrderStatus } from '../../../shared/types/order';
import type { Vehicle } from '../../../shared/types/vehicle';
import type { OrdersStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'OrderDetail'>;
type R = RouteProp<OrdersStackParamList, 'OrderDetail'>;

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

export function OrderDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<R>();
  const { id } = params;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Assign vehicle modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const o = await orderService.get(id);
      setOrder(o);
    } catch {
      setLoadError('Could not load order. Try again.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAdvance = useCallback(async () => {
    if (!order) return;
    const next = nextStatus(order.status);
    if (!next) return;
    setAdvancing(true);
    setActionError(null);
    try {
      const updated = await orderService.updateStatus(order.id, next);
      setOrder(updated);
    } catch (e: any) {
      const code = e?.response?.data?.error;
      if (code === 'invalid_status_transition') {
        setActionError('That status change is not allowed.');
      } else {
        setActionError('Could not update status. Try again.');
      }
    } finally {
      setAdvancing(false);
    }
  }, [order]);

  const openAssign = useCallback(async () => {
    setAssignOpen(true);
    setVehicles(null);
    setVehiclesError(null);
    try {
      const list = await vehicleService.list();
      // Filter active vehicles only.
      setVehicles(list.filter((v) => v.is_active));
    } catch {
      setVehiclesError('Could not load vehicles. Try again.');
      setVehicles([]);
    }
  }, []);

  const closeAssign = useCallback(() => {
    setAssignOpen(false);
    setVehicles(null);
    setVehiclesError(null);
  }, []);

  const onAssignVehicle = useCallback(async (vehicleId: number) => {
    if (!order) return;
    setAssigning(true);
    setActionError(null);
    try {
      const updated = await orderService.assignVehicle(order.id, vehicleId);
      setOrder(updated);
      closeAssign();
    } catch (e: any) {
      const code = e?.response?.data?.error;
      if (code === 'vehicle_not_found') {
        setActionError('That vehicle no longer exists.');
      } else {
        setActionError('Could not assign vehicle. Try again.');
      }
    } finally {
      setAssigning(false);
    }
  }, [order, closeAssign]);

  if (loadError) {
    return (
      <View style={styles.wrap}>
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      </View>
    );
  }

  if (!order) return <Loader />;

  const s = statusStyles(order.status);
  const canAdv = canAdvance(order.status);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.wrapInner}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{order.order_no}</Text>
        <Pressable onPress={() => navigation.goBack()} testID="back-btn">
          <Text style={styles.backLink}>← Back</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Row label="Order Date" value={order.order_date ?? '—'} />
        <Row label="Customer" value={order.customer_name} />
        <Row label="Route" value={`${order.from_loc ?? '—'} → ${order.to_loc ?? '—'}`} />
        <Row label="Goods" value={order.goods_desc ?? '—'} />

        <View style={styles.sectionDivider} />

        <Text style={styles.sectionLabel}>Status</Text>
        <View style={[styles.pill, { backgroundColor: s.bg }]}>
          <Text style={[styles.pillText, { color: s.fg }]}>{STATUS_LABELS[order.status]}</Text>
        </View>

        <View style={styles.sectionDivider} />

        <Text style={styles.sectionLabel}>Vehicle</Text>
        {order.vehicle_no ? (
          <>
            <Text style={styles.vehicleNo}>{order.vehicle_no}</Text>
            {order.vehicle_type ? (
              <Text style={styles.vehicleMeta}>Type: {order.vehicle_type}</Text>
            ) : null}
            {order.vehicle_owner_name ? (
              <Text style={styles.vehicleMeta}>Owner: {order.vehicle_owner_name}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.vehicleMeta}>No vehicle assigned</Text>
        )}
      </View>

      {actionError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{actionError}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.actionBtn}>
          <ButtonPrimary
            title={canAdv ? `Advance to ${STATUS_LABELS[nextStatus(order.status) as OrderStatus]}` : 'Completed'}
            onPress={onAdvance}
            loading={advancing}
            disabled={!canAdv}
            testID="advance-status-btn"
          />
        </View>
        <View style={styles.actionBtn}>
          <ButtonPrimary
            title="Assign Vehicle"
            onPress={openAssign}
            testID="assign-vehicle-btn"
          />
        </View>
      </View>

      <Modal
        visible={assignOpen}
        onClose={closeAssign}
        title="Assign Vehicle"
        testID="assign-vehicle-modal"
      >
        {vehicles === null ? (
          <Loader />
        ) : vehiclesError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{vehiclesError}</Text>
          </View>
        ) : vehicles.length === 0 ? (
          <Text style={styles.emptyText}>No active vehicles available.</Text>
        ) : (
          <ScrollView style={styles.vehicleList}>
            {vehicles.map((v) => (
              <Pressable
                key={v.id}
                style={styles.vehicleOption}
                onPress={() => onAssignVehicle(v.id)}
                disabled={assigning}
                accessibilityRole="button"
                testID={`assign-option-${v.id}`}
              >
                <Text style={styles.vehicleOptionNo}>{v.vehicle_no}</Text>
                <Text style={styles.vehicleOptionMeta}>
                  {v.vehicle_type ?? '—'} · {v.owner_name ?? '—'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Modal>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  wrapInner: { padding: spacing.lg },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.lg,
  },
  title: { fontSize: 22, color: colors.text, fontFamily: typography.uiBold },
  backLink: { color: colors.primary, fontFamily: typography.uiBold, fontSize: 14 },
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg,
  },
  row: { marginBottom: spacing.md },
  rowLabel: {
    fontSize: 12, color: colors.textMuted,
    fontFamily: typography.ui, marginBottom: 2,
  },
  rowValue: { fontSize: 15, color: colors.text, fontFamily: typography.ui },
  sectionDivider: {
    height: 1, backgroundColor: colors.border, marginVertical: spacing.md,
  },
  sectionLabel: {
    fontSize: 12, color: colors.textMuted,
    fontFamily: typography.ui, marginBottom: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 13, fontFamily: typography.uiBold },
  vehicleNo: { fontSize: 16, color: colors.text, fontFamily: typography.uiBold },
  vehicleMeta: {
    fontSize: 13, color: colors.textMuted,
    fontFamily: typography.ui, marginTop: 2,
  },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { color: colors.danger, fontFamily: typography.ui, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1 },
  vehicleList: { maxHeight: 400 },
  vehicleOption: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  vehicleOptionNo: { fontSize: 15, color: colors.text, fontFamily: typography.uiBold },
  vehicleOptionMeta: { fontSize: 12, color: colors.textMuted, fontFamily: typography.ui },
  emptyText: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 13 },
});
