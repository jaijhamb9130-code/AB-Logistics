import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ReportsStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../constants/theme';

type Nav = NativeStackNavigationProp<ReportsStackParamList, 'ReportsHub'>;

interface ReportCard {
  title: string;
  description: string;
  screen: keyof ReportsStackParamList;
  params?: any;
  color: string;
}

const REPORTS: ReportCard[] = [
  {
    title: 'Bilty Register',
    description: 'All bilties in a date range with freight totals, truck and consignor',
    screen: 'BiltyRegister',
    color: '#3B82F6',
  },
  {
    title: 'Voucher Register',
    description: 'All vouchers filtered by type, date range and party name',
    screen: 'VoucherRegister',
    color: '#8B5CF6',
  },
  {
    title: 'Ledger Statement',
    description: 'Single ledger — opening balance, all transactions with running balance',
    screen: 'LedgerStatement',
    color: '#10B981',
  },
  {
    title: 'Group Summary',
    description: 'Trial Balance — debit / credit totals grouped by ledger group',
    screen: 'GroupSummary',
    color: '#F59E0B',
  },
];

export function ReportsHubScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Reports</Text>

      <View style={styles.grid}>
        {REPORTS.map((r) => (
          <Pressable
            key={r.screen}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate(r.screen as any, r.params)}
            accessibilityRole="button"
          >
            <View style={[styles.cardAccent, { backgroundColor: r.color }]} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{r.title}</Text>
              <Text style={styles.cardDesc}>{r.description}</Text>
            </View>
            <Text style={[styles.cardArrow, { color: r.color }]}>→</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  pageTitle: {
    fontFamily: typography.uiHeavy,
    fontSize: 22,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  grid: { gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },
  cardAccent: { width: 5, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: spacing.md },
  cardTitle: {
    fontFamily: typography.uiBold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 3,
  },
  cardDesc: {
    fontFamily: typography.ui,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  cardArrow: {
    fontFamily: typography.uiBold,
    fontSize: 18,
    paddingRight: spacing.md,
  },
});
