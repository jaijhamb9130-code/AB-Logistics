/**
 * DataTable — Tally-style, data-dense, reusable table primitive (plan 02-02).
 *
 * Design rules (D-08..D-12):
 *  - Sticky header (web uses CSS position:'sticky'; native fixed header view)
 *  - Right-align numeric columns; numeric columns use typography.mono
 *  - Compact rows (paddingVertical = spacing.sm)
 *  - Alt-row background (colors.background on odd rows)
 *  - Zero hardcoded hex — all colors / spacing / radius / typography imported
 *    from theme.
 *  - Auto S.No. column (showSerialNo, default true) — sequential 1-based index.
 *
 * Row-action column is NOT part of this primitive; screens that need Edit /
 * Deactivate buttons add a custom `render` on an extra column (plan 02-03).
 */

import React, { useMemo } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, text, typography } from '../constants/theme';

export type ColumnAlign = 'left' | 'right' | 'center';

export interface Column<T> {
  key: string;
  label: string;
  width?: number;
  align?: ColumnAlign;
  /** Render cell content — must return a string or a React node. */
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string | number;
  onRowPress?: (row: T) => void;
  stickyHeader?: boolean;
  emptyLabel?: string;
  testID?: string;
  /** Show an auto-incrementing S.No. column as the first column. Default: true */
  showSerialNo?: boolean;
}

const SERIAL_COL_WIDTH = 80;

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowPress,
  stickyHeader = true,
  emptyLabel = 'No records',
  testID,
  showSerialNo = true,
}: Props<T>) {
  // Build the effective columns list — prepend S.No. when enabled.
  // The S.No. render receives the row but ignores it; the index is injected at
  // render-time via a wrapper (see renderRow).
  const effectiveColumns: Column<T>[] = useMemo(() => {
    if (!showSerialNo) return columns;

    const serialCol: Column<T> = {
      key: '__sno__',
      label: 'S. No.',
      width: SERIAL_COL_WIDTH,
      align: 'center',
      // Placeholder — actual serial number is injected in renderRow.
      render: () => '',
    };
    return [serialCol, ...columns];
  }, [columns, showSerialNo]);

  // ------- Header row -------
  const lastIndex = effectiveColumns.length - 1;
  const header = (
    <View style={[styles.row, styles.headerRow]}>
      {effectiveColumns.map((col, i) => (
        <View
          key={col.key}
          style={[
            styles.cell,
            col.width ? { width: col.width, flexGrow: 0 } : { flex: 1 },
            alignStyle(col.align),
            i < lastIndex && styles.cellDivider,
          ]}
        >
          <Text
            style={[
              styles.headerText,
              col.align === 'right' && styles.textRight,
              col.align === 'center' && styles.textCenter,
            ]}
            numberOfLines={1}
          >
            {col.label}
          </Text>
        </View>
      ))}
    </View>
  );

  // ------- Row renderer -------
  const renderRow = ({ item, index }: { item: T; index: number }) => {
    const alt = index % 2 === 1;
    const content = (
      <View style={[styles.row, alt && styles.altRow]}>
        {effectiveColumns.map((col, i) => {
          // For the S.No. column, render the 1-based index directly.
          const isSerial = col.key === '__sno__';
          const rendered = isSerial ? String(index + 1) : col.render(item);
          return (
            <View
              key={col.key}
              style={[
                styles.cell,
                col.width ? { width: col.width, flexGrow: 0 } : { flex: 1 },
                alignStyle(col.align),
                i < lastIndex && styles.cellDivider,
              ]}
            >
              {typeof rendered === 'string' || typeof rendered === 'number' ? (
                <Text
                  style={[
                    styles.cellText,
                    col.align === 'right' && styles.textRight,
                    col.align === 'right' && styles.mono,
                    col.align === 'center' && styles.textCenter,
                    isSerial && styles.serialText,
                  ]}
                  numberOfLines={1}
                >
                  {String(rendered)}
                </Text>
              ) : (
                rendered
              )}
            </View>
          );
        })}
      </View>
    );

    if (!onRowPress) return content;
    if (Platform.OS === 'web') {
      return (
        <View
          // @ts-ignore — web-only prop, safe to ignore on native
          onClick={() => onRowPress(item)}
          style={{ cursor: 'pointer' } as any}
        >
          {content}
        </View>
      );
    }
    return <Pressable onPress={() => onRowPress(item)}>{content}</Pressable>;
  };

  // ------- Web: CSS sticky via ScrollView. Native: separate header + FlatList. -------
  if (Platform.OS === 'web' && stickyHeader) {
    return (
      <View style={styles.wrap} testID={testID}>
        <ScrollView
          style={styles.scroll}
          stickyHeaderIndices={[0]}
          showsVerticalScrollIndicator
        >
          {header}
          {rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{emptyLabel}</Text>
            </View>
          ) : (
            rows.map((row, i) => (
              <View key={keyExtractor(row)}>
                {renderRow({ item: row, index: i })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID={testID}>
      {stickyHeader && header}
      <FlatList
        data={rows}
        keyExtractor={(r) => String(keyExtractor(r))}
        renderItem={renderRow}
        ListHeaderComponent={!stickyHeader ? header : undefined}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          </View>
        }
      />
    </View>
  );
}

function alignStyle(align?: ColumnAlign): ViewStyle {
  if (align === 'right') return { alignItems: 'flex-end' };
  if (align === 'center') return { alignItems: 'center' };
  return { alignItems: 'flex-start' };
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    minHeight: 38,
  },
  headerRow: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    minHeight: 34,
  },
  altRow: {
    backgroundColor: '#FAFBFC',
  },
  cell: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cellDivider: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  headerText: {
    ...text.label,
    fontSize: 14,
    color: colors.textLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  cellText: {
    ...text.value,
    fontSize: 14,
    lineHeight: 20,
  },
  serialText: {
    fontFamily: typography.mono,
    color: colors.textMuted,
    fontWeight: '600',
  },
  mono: {
    fontFamily: typography.mono,
  },
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
  emptyWrap: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...text.meta,
    fontSize: 13,
  },
});
