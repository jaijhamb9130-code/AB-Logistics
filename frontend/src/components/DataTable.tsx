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

import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
const MOBILE_BREAKPOINT = 768;
// Mobile card view paginates after this many rows.
const MOBILE_PAGE_SIZE = 20;
// Default minimum width for flex columns on mobile so they don't squish.
const MOBILE_FLEX_MIN_WIDTH = 160;

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
  const { width: viewportWidth } = useWindowDimensions();
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;

  // Mobile card pagination. Clamp the page when the row count shrinks (search /
  // delete) so we never land on an empty page past the end.
  const [page, setPage] = useState(0);
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(rows.length / MOBILE_PAGE_SIZE) - 1);
    setPage((p) => Math.min(p, maxPage));
  }, [rows.length]);

  // Build the effective columns list — prepend S.No. when enabled.
  // The S.No. render receives the row but ignores it; the index is injected at
  // render-time via a wrapper (see renderRow).
  const effectiveColumns: Column<T>[] = useMemo(() => {
    if (!showSerialNo) return columns;

    const serialCol: Column<T> = {
      key: '__sno__',
      label: 'S. No.',
      width: isMobile ? 60 : SERIAL_COL_WIDTH,
      align: 'center',
      // Placeholder — actual serial number is injected in renderRow.
      render: () => '',
    };
    return [serialCol, ...columns];
  }, [columns, showSerialNo, isMobile]);

  // Compute total min width on mobile so the inner table is wider than viewport
  // and the horizontal ScrollView actually scrolls.
  const totalMinWidth = useMemo(() => {
    if (!isMobile) return 0;
    return effectiveColumns.reduce(
      (sum, c) => sum + (c.width ?? MOBILE_FLEX_MIN_WIDTH),
      spacing.lg * 2
    );
  }, [effectiveColumns, isMobile]);

  // Returns the per-cell width style — fixed if `width` set, flex otherwise.
  // On mobile, flex columns get a minWidth so the row spans wider than viewport.
  const cellWidthStyle = (col: Column<T>): ViewStyle => {
    if (col.width) return { width: col.width, flexGrow: 0 };
    if (isMobile) return { width: MOBILE_FLEX_MIN_WIDTH, flexGrow: 0 };
    return { flex: 1 };
  };

  // ------- Header row -------
  const lastIndex = effectiveColumns.length - 1;
  const rowSizingStyle: ViewStyle | undefined = isMobile
    ? { minWidth: totalMinWidth }
    : undefined;
  const header = (
    <View style={[styles.row, styles.headerRow, rowSizingStyle]}>
      {effectiveColumns.map((col, i) => (
        <View
          key={col.key}
          style={[
            styles.cell,
            cellWidthStyle(col),
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
      <View style={[styles.row, alt && styles.altRow, rowSizingStyle]}>
        {effectiveColumns.map((col, i) => {
          // For the S.No. column, render the 1-based index directly.
          const isSerial = col.key === '__sno__';
          const rendered = isSerial ? String(index + 1) : col.render(item);
          return (
            <View
              key={col.key}
              style={[
                styles.cell,
                cellWidthStyle(col),
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

  // ------- Mobile: one stacked card per row (label / value pairs) -------
  // Columnar tables don't fit a phone, so on mobile we drop the grid entirely
  // and render each row as a dense KV card (same pattern as the Bilty list),
  // instead of forcing a horizontal scroll.
  if (isMobile) {
    // Label-bearing columns become KV rows; label-less columns (Edit/Delete
    // action buttons) move into the card's top row next to the #N serial.
    const dataColumns = columns.filter((c) => !!c.label);
    const actionColumns = columns.filter((c) => !c.label);
    const totalPages = Math.max(1, Math.ceil(rows.length / MOBILE_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const start = currentPage * MOBILE_PAGE_SIZE;
    const pageRows = rows.slice(start, start + MOBILE_PAGE_SIZE);
    const showHead = showSerialNo || actionColumns.length > 0;

    const renderCard = ({ item, index }: { item: T; index: number }) => {
      const body = (
        <View style={styles.card}>
          {showHead ? (
            // Top row: #N on the left, Edit/Delete on the right — saves a whole
            // extra action row of vertical space.
            <View style={styles.cardHead}>
              {showSerialNo ? <Text style={styles.cardSerial}>#{start + index + 1}</Text> : <View />}
              {actionColumns.length > 0 ? (
                <View style={styles.cardHeadActions}>
                  {actionColumns.map((col) => (
                    <View key={col.key}>{col.render(item)}</View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {dataColumns.map((col) => {
            const rendered = col.render(item);
            const isText = typeof rendered === 'string' || typeof rendered === 'number';
            return (
              <View key={col.key} style={styles.cardRow}>
                <Text style={styles.cardLabel}>{col.label}</Text>
                <View style={styles.cardValueWrap}>
                  {isText ? (
                    <Text
                      style={[styles.cardValueText, col.align === 'right' && styles.mono]}
                      numberOfLines={1}
                    >
                      {String(rendered)}
                    </Text>
                  ) : (
                    rendered
                  )}
                </View>
              </View>
            );
          })}
        </View>
      );
      if (!onRowPress) return body;
      if (Platform.OS === 'web') {
        return (
          // @ts-ignore — web-only onClick
          <View onClick={() => onRowPress(item)} style={{ cursor: 'pointer' } as any}>
            {body}
          </View>
        );
      }
      return <Pressable onPress={() => onRowPress(item)}>{body}</Pressable>;
    };

    return (
      <View style={styles.cardWrap} testID={testID}>
        {rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={pageRows}
              keyExtractor={(r) => String(keyExtractor(r))}
              renderItem={renderCard}
              contentContainerStyle={styles.cardListContent}
              showsVerticalScrollIndicator={false}
            />
            {totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  disabled={currentPage === 0}
                  onPress={() => setPage(currentPage - 1)}
                  style={[styles.pageArrow, currentPage === 0 && styles.pageDisabled]}
                >
                  <Text style={styles.pageArrowText}>‹</Text>
                </Pressable>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pageNumbers}
                >
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setPage(i)}
                      style={[styles.pageNum, i === currentPage && styles.pageNumActive]}
                    >
                      <Text style={[styles.pageNumText, i === currentPage && styles.pageNumTextActive]}>
                        {i + 1}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  disabled={currentPage === totalPages - 1}
                  onPress={() => setPage(currentPage + 1)}
                  style={[styles.pageArrow, currentPage === totalPages - 1 && styles.pageDisabled]}
                >
                  <Text style={styles.pageArrowText}>›</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>
    );
  }

  // ------- Web: CSS sticky via ScrollView. Native: separate header + FlatList. -------
  if (Platform.OS === 'web' && stickyHeader) {
    const verticalScroll = (
      <ScrollView
        style={styles.scroll}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator
      >
        {header}
        {rows.length === 0 ? (
          <View style={[styles.emptyWrap, rowSizingStyle]}>
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
    );

    return (
      <View style={styles.wrap} testID={testID}>
        {isMobile ? (
          <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
            <View style={{ minWidth: totalMinWidth, flex: 1 }}>
              {verticalScroll}
            </View>
          </ScrollView>
        ) : (
          verticalScroll
        )}
      </View>
    );
  }

  const innerNative = (
    <>
      {stickyHeader && header}
      <FlatList
        data={rows}
        keyExtractor={(r) => String(keyExtractor(r))}
        renderItem={renderRow}
        ListHeaderComponent={!stickyHeader ? header : undefined}
        ListEmptyComponent={
          <View style={[styles.emptyWrap, rowSizingStyle]}>
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          </View>
        }
      />
    </>
  );

  return (
    <View style={styles.wrap} testID={testID}>
      {isMobile ? (
        <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
          <View style={{ minWidth: totalMinWidth, flex: 1 }}>{innerNative}</View>
        </ScrollView>
      ) : (
        innerNative
      )}
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

  // ── Mobile card layout — full-bleed, dense rows, divider between cards ──
  cardWrap: {
    flex: 1,
    backgroundColor: colors.card,
    // Screens wrap the table in a `padding: spacing.lg` container; cancel that
    // horizontally so the card list runs edge-to-edge (the header/search above
    // keep their padding).
    marginHorizontal: -spacing.lg,
  },
  cardListContent: {
    // No side gutters — cards span edge to edge for maximum width / density.
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: 5,
    paddingBottom: 6,
  },
  // Top row of each card: #N on the left, Edit/Delete actions on the right.
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardSerial: {
    fontFamily: typography.mono,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
  },
  cardHeadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // The Edit/Delete buttons are styled per-screen (theme `text.action`), so
    // shrink the whole cluster here to keep them compact in the card header
    // without touching every screen. Anchored to the right edge on web.
    transform: [{ scale: 0.78 }],
    ...(Platform.OS === 'web' ? ({ transformOrigin: 'right center' } as any) : {}),
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 1,
    gap: spacing.md,
  },
  cardLabel: {
    ...text.label,
    fontSize: 11,
    color: colors.textLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  cardValueWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cardValueText: {
    ...text.value,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },

  // ── Pagination bar ──
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.xs,
  },
  pageNumbers: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  pageNum: {
    minWidth: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: '#F1F5F9',
  },
  pageNumActive: {
    backgroundColor: colors.brandRed,
  },
  pageNumText: {
    fontFamily: typography.uiBold,
    fontSize: 13,
    color: colors.textStrong,
  },
  pageNumTextActive: {
    color: '#FFFFFF',
  },
  pageArrow: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  pageArrowText: {
    fontFamily: typography.uiBold,
    fontSize: 18,
    lineHeight: 20,
    color: colors.textStrong,
  },
  pageDisabled: {
    opacity: 0.4,
  },
  emptyText: {
    ...text.meta,
    fontSize: 13,
  },
});
