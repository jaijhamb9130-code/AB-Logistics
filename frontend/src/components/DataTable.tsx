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
  /** Currently sorted column key */
  sortBy?: string;
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
  /** Called when a column header is pressed — parent should update sortBy/sortDir */
  onSort?: (key: string) => void;
  /** Desktop rows per page (0 = no pagination). Default: 25 */
  desktopPageSize?: number;
  /** Serial number offset for paginated views (default 0). E.g. page 2 with pageSize 25 → offset 25 */
  serialOffset?: number;
}

const SERIAL_COL_WIDTH = 44;
const MOBILE_BREAKPOINT = 768;
const MOBILE_PAGE_SIZE = 20;
const MOBILE_FLEX_MIN_WIDTH = 160;

const DESKTOP_PAGE_SIZE_DEFAULT = 25;

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowPress,
  stickyHeader = true,
  emptyLabel = 'No records',
  testID,
  showSerialNo = true,
  sortBy,
  sortDir,
  onSort,
  desktopPageSize = DESKTOP_PAGE_SIZE_DEFAULT,
  serialOffset = 0,
}: Props<T>) {
  const { width: viewportWidth } = useWindowDimensions();
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;

  // Mobile card pagination. Clamp the page when the row count shrinks (search /
  // delete) so we never land on an empty page past the end.
  const [page, setPage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(rows.length / MOBILE_PAGE_SIZE) - 1);
    setPage((p) => Math.min(p, maxPage));
  }, [rows.length]);
  // Reset desktop page when rows change (filter applied)
  useEffect(() => {
    const maxPage = desktopPageSize > 0
      ? Math.max(0, Math.ceil(rows.length / desktopPageSize) - 1)
      : 0;
    setDesktopPage((p) => Math.min(p, maxPage));
  }, [rows.length, desktopPageSize]);

  // Build the effective columns list — prepend S.No. when enabled.
  // The S.No. render receives the row but ignores it; the index is injected at
  // render-time via a wrapper (see renderRow).
  const effectiveColumns: Column<T>[] = useMemo(() => {
    if (!showSerialNo) return columns;

    const serialCol: Column<T> = {
      key: '__sno__',
      label: '#',
      width: isMobile ? 44 : SERIAL_COL_WIDTH,
      align: 'center',
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
      {effectiveColumns.map((col, i) => {
        const isSorted = sortBy === col.key;
        const sortable = !!onSort && col.key !== '__sno__';
        const cellContent = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text
              style={[
                styles.headerText,
                col.align === 'right' && styles.textRight,
                col.align === 'center' && styles.textCenter,
                isSorted && styles.headerSorted,
              ]}
              numberOfLines={1}
            >
              {col.label}
            </Text>
            {sortable && (
              <Text style={[styles.sortArrow, isSorted && styles.sortArrowActive]}>
                {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </Text>
            )}
          </View>
        );
        return (
          <View
            key={col.key}
            style={[
              styles.cell,
              cellWidthStyle(col),
              alignStyle(col.align),
              i < lastIndex && styles.cellDivider,
              sortable && styles.sortableHeader,
            ]}
          >
            {sortable ? (
              Platform.OS === 'web' ? (
                <View
                  // @ts-ignore web onClick
                  onClick={() => onSort!(col.key)}
                  style={({ cursor: 'pointer' } as any)}
                >
                  {cellContent}
                </View>
              ) : (
                <Pressable onPress={() => onSort!(col.key)}>{cellContent}</Pressable>
              )
            ) : cellContent}
          </View>
        );
      })}
    </View>
  );

  // ------- Row renderer -------
  const renderRow = ({ item, index }: { item: T; index: number }) => {
    const alt = index % 2 === 1;
    const content = (
      <View style={[styles.row, alt && styles.altRow, rowSizingStyle]}>
        {effectiveColumns.map((col, i) => {
          // For the S.No. column, render the 1-based index + offset.
          const isSerial = col.key === '__sno__';
          const rendered = isSerial ? String(serialOffset + index + 1) : col.render(item);
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
    // Desktop pagination — slice rows if desktopPageSize > 0
    const totalDesktopPages = desktopPageSize > 0 ? Math.max(1, Math.ceil(rows.length / desktopPageSize)) : 1;
    const currentDesktopPage = Math.min(desktopPage, totalDesktopPages - 1);
    const desktopRows = desktopPageSize > 0
      ? rows.slice(currentDesktopPage * desktopPageSize, (currentDesktopPage + 1) * desktopPageSize)
      : rows;
    const desktopOffset = serialOffset + currentDesktopPage * desktopPageSize;

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
          desktopRows.map((row, i) => (
            <View key={keyExtractor(row)}>
              {renderRow({ item: row, index: desktopOffset - serialOffset + i })}
            </View>
          ))
        )}
      </ScrollView>
    );

    return (
      <View style={[styles.wrap, { overflow: 'visible' as any }]} testID={testID}>
        {isMobile ? (
          <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
            <View style={{ minWidth: totalMinWidth, flex: 1 }}>
              {verticalScroll}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {verticalScroll}
            {(totalDesktopPages > 1 || rows.length > 0) && (
              <View style={styles.pagination}>
                <Text style={styles.pageInfo}>
                  {rows.length === 0 ? '0 records' : `${currentDesktopPage * desktopPageSize + 1}–${Math.min((currentDesktopPage + 1) * desktopPageSize, rows.length)} of ${rows.length}`}
                </Text>
                {totalDesktopPages > 1 && (
                  <View style={styles.pageNav}>
                    <Pressable disabled={currentDesktopPage === 0} onPress={() => setDesktopPage(0)} style={[styles.pageBtn, currentDesktopPage === 0 && styles.pageBtnDisabled]}>
                      <Text style={styles.pageBtnText}>«</Text>
                    </Pressable>
                    <Pressable disabled={currentDesktopPage === 0} onPress={() => setDesktopPage(currentDesktopPage - 1)} style={[styles.pageBtn, currentDesktopPage === 0 && styles.pageBtnDisabled]}>
                      <Text style={styles.pageBtnText}>‹</Text>
                    </Pressable>
                    <View style={styles.pageLabel}>
                      <Text style={styles.pageLabelText}>Page {currentDesktopPage + 1} / {totalDesktopPages}</Text>
                    </View>
                    <Pressable disabled={currentDesktopPage === totalDesktopPages - 1} onPress={() => setDesktopPage(currentDesktopPage + 1)} style={[styles.pageBtn, currentDesktopPage === totalDesktopPages - 1 && styles.pageBtnDisabled]}>
                      <Text style={styles.pageBtnText}>›</Text>
                    </Pressable>
                    <Pressable disabled={currentDesktopPage === totalDesktopPages - 1} onPress={() => setDesktopPage(totalDesktopPages - 1)} style={[styles.pageBtn, currentDesktopPage === totalDesktopPages - 1 && styles.pageBtnDisabled]}>
                      <Text style={styles.pageBtnText}>»</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
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
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' } as any) : { elevation: 1 }),
  },
  scroll: { flex: 1 },

  // ── Table rows ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
    minHeight: 36,
    ...(Platform.OS === 'web' ? ({ transition: 'background-color 0.1s ease' } as any) : {}),
  },
  headerRow: {
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 32,
  },
  altRow: { backgroundColor: '#FAFAFA' },

  // ── Cells ──
  cell: {
    paddingHorizontal: 12,
    paddingVertical: 0,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cellDivider: {},

  // ── Header text ──
  headerText: {
    fontFamily: typography.uiBold,
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerSorted: { color: '#111827' },
  sortableHeader: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : {}),
  },
  sortArrow: {
    fontSize: 10,
    color: '#D1D5DB',
    fontFamily: typography.uiBold,
  },
  sortArrowActive: { color: '#374151' },

  // ── Cell text ──
  cellText: {
    fontFamily: typography.uiMedium,
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  serialText: {
    fontFamily: typography.uiMedium,
    fontSize: 12,
    color: '#9CA3AF',
  },
  mono: { fontFamily: typography.mono },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
  emptyWrap: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },

  // ── Mobile cards ──
  cardWrap: {
    flex: 1,
    backgroundColor: colors.card,
    marginHorizontal: -spacing.lg,
  },
  cardListContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingHorizontal: spacing.md,
    paddingTop: 6,
    paddingBottom: 6,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardSerial: {
    fontFamily: typography.uiMedium,
    fontSize: 11,
    color: '#9CA3AF',
  },
  cardHeadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    fontFamily: typography.uiBold,
    fontSize: 10,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  cardValueWrap: { flex: 1, alignItems: 'flex-end' },
  cardValueText: {
    fontFamily: typography.uiMedium,
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    textAlign: 'right',
  },

  // ── Pagination bar — abscloud style ──
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
    minHeight: 40,
  },
  pageInfo: {
    fontFamily: typography.uiBold,
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pageBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  pageBtnDisabled: {
    opacity: 0.35,
    ...(Platform.OS === 'web' ? ({ cursor: 'not-allowed' } as any) : {}),
  },
  pageBtnText: {
    fontFamily: typography.uiBold,
    fontSize: 13,
    color: '#374151',
    lineHeight: 16,
  },
  pageLabel: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 2,
  },
  pageLabelText: {
    fontFamily: typography.uiBold,
    fontSize: 11,
    color: '#374151',
  },

  // Mobile pagination (existing style kept for mobile card view)
  pageNumbers: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  pageNum: { minWidth: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  pageNumActive: { backgroundColor: colors.brandRed, borderColor: colors.brandRed },
  pageNumText: { fontFamily: typography.uiBold, fontSize: 12, color: '#374151' },
  pageNumTextActive: { color: '#FFFFFF' },
  pageArrow: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  pageArrowText: { fontFamily: typography.uiBold, fontSize: 16, lineHeight: 18, color: '#374151' },
  pageDisabled: { opacity: 0.35 },

  emptyText: {
    fontFamily: typography.uiMedium,
    fontSize: 13,
    color: '#9CA3AF',
  },
});
