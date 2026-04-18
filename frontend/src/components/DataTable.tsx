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
 *
 * Row-action column is NOT part of this primitive; screens that need Edit /
 * Deactivate buttons add a custom `render` on an extra column (plan 02-03).
 */

import React from 'react';
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
import { colors, radius, spacing, typography } from '../constants/theme';

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
}

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowPress,
  stickyHeader = true,
  emptyLabel = 'No records',
  testID,
}: Props<T>) {
  // ------- Header row -------
  const header = (
    <View style={[styles.row, styles.headerRow]}>
      {columns.map((col) => (
        <View
          key={col.key}
          style={[
            styles.cell,
            col.width ? { width: col.width, flexGrow: 0 } : { flex: 1 },
            alignStyle(col.align),
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
      <View
        style={[styles.row, alt && styles.altRow]}
        accessibilityRole={onRowPress ? 'button' : undefined}
      >
        {columns.map((col) => {
          const rendered = col.render(item);
          return (
            <View
              key={col.key}
              style={[
                styles.cell,
                col.width ? { width: col.width, flexGrow: 0 } : { flex: 1 },
                alignStyle(col.align),
              ]}
            >
              {typeof rendered === 'string' || typeof rendered === 'number' ? (
                <Text
                  style={[
                    styles.cellText,
                    col.align === 'right' && styles.textRight,
                    col.align === 'right' && styles.mono,
                    col.align === 'center' && styles.textCenter,
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

    return onRowPress ? (
      <Pressable onPress={() => onRowPress(item)}>{content}</Pressable>
    ) : (
      content
    );
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
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerRow: {
    backgroundColor: colors.background,
  },
  altRow: {
    backgroundColor: colors.background,
  },
  cell: {
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: typography.ui,
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
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: typography.ui,
  },
});
