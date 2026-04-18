/**
 * FreightMemoScreen — list of freight memos + "Generate from Bilty" picker
 * (Phase 4).
 *
 * CLAUDE.md rule honored: no manual entry. The ONLY way to create a memo from
 * this screen is to pick a saved bilty — the picker modal shows the bilty
 * list; tapping a row calls freightService.generate(bilty.id) and navigates
 * to the memo detail. If a memo already exists for the chosen bilty the
 * backend 409s and we route to the existing memo instead (idempotent UX).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, typography } from '../constants/theme';
import { freightService } from '../services/freightService';
import { biltyService } from '../services/biltyService';
import { toNum } from '../utils/biltyValidation';
import type { FreightMemoListItem } from '../../../shared/types/freight';
import type { BiltyListItem } from '../../../shared/types/bilty';
import type { FreightStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<FreightStackParamList, 'FreightList'>;

export function FreightMemoScreen() {
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<FreightMemoListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bilties, setBilties] = useState<BiltyListItem[] | null>(null);
  const [pickerErr, setPickerErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await freightService.list();
      setRows(list);
    } catch (_e) {
      setErr('Could not load freight memos. Try again.');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setPickerErr(null);
    setBilties(null);
    try {
      const list = await biltyService.list();
      setBilties(list);
    } catch (_e) {
      setPickerErr('Could not load bilties.');
      setBilties([]);
    }
  }, []);

  const pickBilty = useCallback(
    async (b: BiltyListItem) => {
      if (generating) return;
      setGenerating(true);
      setPickerErr(null);
      try {
        const memo = await freightService.generate(b.id);
        setPickerOpen(false);
        navigation.navigate('FreightDetail', { id: memo.id });
      } catch (e: any) {
        const code = e?.response?.status;
        if (code === 409) {
          // Memo already exists — fetch existing and navigate to it.
          try {
            const existing = await freightService.getByBiltyId(b.id);
            setPickerOpen(false);
            navigation.navigate('FreightDetail', { id: existing.id });
            return;
          } catch {
            setPickerErr('A memo already exists for this bilty.');
          }
        } else if (code === 404) {
          setPickerErr('Bilty not found.');
        } else if (code === 403) {
          setPickerErr('You are not permitted to generate freight memos.');
        } else {
          setPickerErr('Could not generate freight memo. Try again.');
        }
      } finally {
        setGenerating(false);
      }
    },
    [generating, navigation]
  );

  // ------- Freight list columns -------
  const columns: Column<FreightMemoListItem>[] = [
    { key: 'memo_no', label: 'Memo No', width: 170, render: (r) => r.memo_no },
    { key: 'memo_date', label: 'Date', width: 120, render: (r) => shortDate(r.memo_date) },
    { key: 'bilty_no', label: 'Bilty No', width: 160, render: (r) => r.bilty_no },
    { key: 'consignor', label: 'Consignor', render: (r) => r.consignor },
    {
      key: 'net_payable', label: 'Net Payable', width: 130, align: 'right',
      render: (r) => fmt(r.net_payable),
    },
    { key: 'created_at', label: 'Created', width: 180, render: (r) => formatDateTime(r.created_at) },
    {
      key: 'actions',
      label: '',
      width: 90,
      align: 'right',
      render: (r) => (
        <Pressable
          onPress={() => navigation.navigate('FreightDetail', { id: r.id })}
          accessibilityRole="button"
          accessibilityLabel={`View ${r.memo_no}`}
          testID={`view-memo-${r.id}`}
        >
          <Text style={styles.viewAction}>View</Text>
        </Pressable>
      ),
    },
  ];

  // ------- Bilty picker columns (minimal) -------
  const biltyCols: Column<BiltyListItem>[] = [
    { key: 'bilty_no', label: 'Bilty No', width: 160, render: (r) => r.bilty_no },
    { key: 'bilty_date', label: 'Date', width: 120, render: (r) => shortDate(r.bilty_date) },
    { key: 'consignor', label: 'Consignor', render: (r) => r.consignor },
    { key: 'truck_no', label: 'Truck No', width: 140, render: (r) => r.truck_no },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Freight Memos</Text>
        <View style={styles.headerBtn}>
          <ButtonPrimary
            title="Generate from Bilty"
            onPress={openPicker}
            testID="generate-memo-btn"
          />
        </View>
      </View>

      {err ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{err}</Text>
        </View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<FreightMemoListItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            onRowPress={(r) => navigation.navigate('FreightDetail', { id: r.id })}
            emptyLabel="No freight memos yet — click Generate from Bilty."
            testID="freight-table"
          />
        </View>
      )}

      <Modal
        visible={pickerOpen}
        onClose={() => (generating ? null : setPickerOpen(false))}
        title="Pick a bilty"
        maxWidth={720}
        testID="bilty-picker"
      >
        {pickerErr ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{pickerErr}</Text>
          </View>
        ) : null}
        {bilties === null ? (
          <Loader />
        ) : (
          <View style={styles.pickerTable}>
            <DataTable<BiltyListItem>
              columns={biltyCols}
              rows={bilties}
              keyExtractor={(r) => r.id}
              onRowPress={pickBilty}
              stickyHeader={false}
              emptyLabel="No bilties available."
              testID="picker-bilty-table"
            />
          </View>
        )}
        {generating ? (
          <Text style={styles.generatingText}>Generating…</Text>
        ) : null}
      </Modal>
    </View>
  );
}

function fmt(n: unknown): string {
  return toNum(n).toFixed(2);
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 22, color: colors.text, fontFamily: typography.uiBold },
  headerBtn: { minWidth: 200 },
  tableWrap: { flex: 1, minHeight: 200 },
  pickerTable: { minHeight: 240, maxHeight: 420 },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    color: colors.danger,
    fontFamily: typography.ui,
    fontSize: 13,
  },
  viewAction: {
    color: colors.primary,
    fontFamily: typography.uiBold,
    fontSize: 13,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  generatingText: {
    color: colors.textMuted,
    fontFamily: typography.ui,
    fontSize: 13,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
