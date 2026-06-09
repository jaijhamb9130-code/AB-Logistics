import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

// Web-only — required so the open list escapes the modal's ScrollView and any
// nested stacking contexts. Without this the menu sits behind subsequent form
// rows because they paint later in DOM order even with high zIndex.
const ReactDOM: any = Platform.OS === 'web' ? require('react-dom') : null;

const ITEM_HEIGHT = 42;
// Show a tall window so typical lists (e.g. all ledger groups) are visible at
// once; anything longer scrolls with an always-visible scrollbar.
const VISIBLE_ITEMS = 12;

interface Props {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
  /**
   * `false` (default) — classic click-to-open dropdown showing all options.
   *                     Use for short fixed lists like Yes/No, status, etc.
   * `true`            — type-to-search field. The list stays closed on focus
   *                     and only opens after the user starts typing,
   *                     filtering options by case-insensitive substring.
   *                     Use for long lists like Item Group / Item Category.
   */
  searchable?: boolean;
  /**
   * Suppresses the wrap's built-in `marginBottom`. Use when SelectDropdown
   * sits inline in a row alongside other inputs — the wrap margin would
   * otherwise make the field's flex box taller than its TextInput siblings,
   * pushing it onto a different vertical baseline under `alignItems: center`.
   */
  compact?: boolean;
  /** When true, the field is non-interactive and visually muted. */
  disabled?: boolean;
  /** Callback to render a '+' button next to the input */
  onCreatePressed?: () => void;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function SelectDropdown({
  label,
  value,
  options,
  onSelect,
  placeholder,
  error,
  testID,
  searchable = false,
  compact = false,
  disabled = false,
  onCreatePressed,
}: Props) {
  // Click-to-open mode owns this flag; searchable mode derives it from text.
  const [openClick, setOpenClick] = useState(false);
  const [searchText, setSearchText] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  const wrapRef = useRef<any>(null);
  const listScrollRef = useRef<any>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const isSearching = searchable && searchText !== null;
  // Visible options:
  //   click mode: all options
  //   search mode: substring-filtered when typing, none otherwise
  const visibleOptions = isSearching
    ? options.filter((o) => o.toLowerCase().includes((searchText || '').toLowerCase()))
    : options;
  const open = searchable
    ? isSearching && visibleOptions.length > 0
    : openClick;

  const measure = () => {
    if (Platform.OS !== 'web') return;
    const node = wrapRef.current;
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const r = node.getBoundingClientRect();
    const MARGIN = 12;
    // Height we'd like (cap at VISIBLE_ITEMS rows) and the space each way.
    const desiredH = ITEM_HEIGHT * Math.min(Math.max(visibleOptions.length, 1), VISIBLE_ITEMS) + 8;
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    // Open downward unless there's clearly more room above. Either way the menu
    // is capped to the available space so the WHOLE list stays on-screen and
    // scrolls — the bottom entries (e.g. child groups) are always reachable.
    const up = spaceBelow < desiredH && spaceAbove > spaceBelow;
    const avail = up ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(ITEM_HEIGHT * 2, Math.min(desiredH, avail));
    setAnchor({
      top: up ? Math.max(MARGIN, r.top - maxHeight - 4) : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, visibleOptions.length]);

  // Reset highlight when the visible list shifts.
  useEffect(() => {
    if (!open) return;
    if (searchable) {
      setHighlightIndex(0);
    } else {
      const idx = visibleOptions.findIndex((o) => o === value);
      setHighlightIndex(idx >= 0 ? idx : 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchable, visibleOptions.length, searchText, value]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onScroll = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const node = itemRefs.current[highlightIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, open]);

  // Web keyboard navigation.
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (visibleOptions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % visibleOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + visibleOptions.length) % visibleOptions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = visibleOptions[highlightIndex];
        if (opt) commitSelection(opt);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibleOptions, highlightIndex]);

  const closeMenu = () => {
    setOpenClick(false);
    setSearchText(null);
  };

  const commitSelection = (opt: string) => {
    onSelect(opt);
    closeMenu();
  };

  const onChangeSearchText = (t: string) => setSearchText(t);

  const onFieldFocus = () => {
    if (disabled) return;
    // searchable mode: reveal the FULL list as soon as the field gains focus
    // (click or tab-in). Seeding searchText to '' makes `isSearching` true with
    // every option visible; typing then filters. Without this the menu only
    // appeared after the first keystroke, so a plain click showed nothing.
    setSearchText((t) => (t === null ? '' : t));
  };

  const onFieldBlur = () => {
    // Defer so a list-item click registers before we close.
    setTimeout(() => setSearchText(null), 150);
  };

  const onClickFieldToggle = () => { if (disabled) return; setOpenClick((v) => !v); };

  // What the input shows in searchable mode.
  const displayValue = isSearching ? (searchText ?? '') : value;
  const effectivePlaceholder = placeholder ?? (searchable ? 'Search...' : 'Select...');

  // ── Web menu — plain HTML inside a body-level portal.
  const renderWebMenu = () => {
    if (!ReactDOM || !anchor) return null;
    return ReactDOM.createPortal(
      <>
        {/* Outside-click scrim. searchable mode also closes via TextInput blur,
            so the scrim is harmless either way. */}
        {!searchable ? (
          <div
            onClick={closeMenu}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999998,
            }}
          />
        ) : null}
        <div
          style={{
            position: 'fixed',
            top: anchor.top,
            left: anchor.left,
            width: anchor.width,
            boxSizing: 'border-box',
            zIndex: 999999,
            background: colors.card,
            border: `1px solid #E2E8F0`,
            borderRadius: radius.md,
            boxShadow: '0 12px 28px rgba(15,23,42,0.14), 0 4px 10px rgba(15,23,42,0.08)',
            overflow: 'hidden',
            paddingTop: 4,
            paddingBottom: 4,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div
            ref={listScrollRef}
            style={{
              // Sized to the available viewport space (computed in measure), so
              // the entire list — including the bottom child groups — is always
              // reachable by scrolling on-screen.
              maxHeight: anchor.maxHeight,
              overflowY: 'auto',
              scrollbarWidth: 'thin' as any,
            }}
          >
            {visibleOptions.length === 0 ? (
              <div
                style={{
                  height: ITEM_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: spacing.md,
                  paddingRight: spacing.md,
                  fontSize: 13,
                  color: colors.textMuted,
                  fontFamily: typography.ui,
                  fontStyle: 'italic',
                }}
              >
                No options
              </div>
            ) : (
              visibleOptions.map((opt, i) => {
                const isSelected = opt === value;
                const isHi = i === highlightIndex;
                return (
                  <div
                    key={opt}
                    ref={(el) => { itemRefs.current[i] = el; }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    onClick={() => commitSelection(opt)}
                    style={{
                      height: ITEM_HEIGHT - 4,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: spacing.md,
                      paddingRight: spacing.md,
                      background: (isHi || isSelected) ? '#2563EB' : 'transparent',
                      color: (isHi || isSelected) ? '#FFFFFF' : colors.text,
                      fontFamily: isSelected ? typography.uiBold : typography.ui,
                      fontSize: 14,
                      lineHeight: '20px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background 90ms ease',
                    }}
                  >
                    {opt}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>,
      document.body,
    );
  };

  // ── Native fallback — absolute-positioned menu inside the wrap.
  const renderNativeMenu = () => (
    <View style={styles.nativeListWrap}>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: ITEM_HEIGHT * VISIBLE_ITEMS }}
        showsVerticalScrollIndicator={visibleOptions.length > VISIBLE_ITEMS}
      >
        {visibleOptions.length === 0 ? (
          <View style={[styles.item, { height: ITEM_HEIGHT }]}>
            <Text style={styles.emptyText}>No options</Text>
          </View>
        ) : (
          visibleOptions.map((opt, i) => (
            <Pressable
              key={opt}
              onPress={() => commitSelection(opt)}
              style={({ pressed }) => [
                styles.item,
                { height: ITEM_HEIGHT },
                i === highlightIndex && styles.itemHighlight,
                opt === value && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
              accessibilityRole="menuitem"
            >
              <Text style={[styles.itemText, opt === value && styles.itemTextActive]}>
                {opt}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  const fieldStyle = [
    styles.field,
    error ? styles.fieldError : null,
    open && styles.fieldOpen,
    disabled && styles.fieldDisabled,
  ];

  return (
    <View ref={wrapRef} style={[styles.wrap, compact && { marginBottom: 0 }]}>
      <Text style={styles.label}>{label}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
        <View style={{ flex: 1 }}>
          {searchable ? (
            // ── Type-to-search variant — the field is a TextInput; list opens
            // only when the user starts typing.
            <View style={fieldStyle}>
              <TextInput
                value={displayValue}
                onChangeText={onChangeSearchText}
                onFocus={onFieldFocus}
                onBlur={onFieldBlur}
                placeholder={effectivePlaceholder}
                placeholderTextColor={colors.textMuted}
                editable={!disabled}
                style={[styles.fieldInput, Platform.OS === 'web' && ({ outlineStyle: 'none', scrollMarginInline: 0 } as any)]}
                testID={testID}
              />
            </View>
          ) : (
            // ── Click-to-open variant — original behaviour. Used by Batch,
            // All Groups filter, and similar short fixed lists.
            <Pressable
              onPress={onClickFieldToggle}
              style={fieldStyle}
              accessibilityRole="button"
              testID={testID}
            >
              <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
                {value || effectivePlaceholder}
              </Text>
              <Text style={[styles.caret, open && styles.caretOpen]}>⌄</Text>
            </Pressable>
          )}
        </View>
        {onCreatePressed && (
          <Pressable
            onPress={onCreatePressed}
            style={({ pressed }: any) => [
              {
                width: 34,
                height: 34,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? '#EEF2F7' : '#FFFFFF',
              }
            ]}
          >
            <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '700' }}>+</Text>
          </Pressable>
        )}
      </View>

      {error ? <Text style={styles.errText}>{error}</Text> : null}

      {open ? (Platform.OS === 'web' ? renderWebMenu() : renderNativeMenu()) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
    position: 'relative',
  },
  label: {
    fontSize: 12,
    color: colors.textLabel,
    marginBottom: 2,
    fontFamily: typography.uiBold,
    letterSpacing: 0.2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  fieldError: { borderColor: colors.danger },
  fieldOpen: { borderColor: '#94A3B8' },
  fieldDisabled: { opacity: 0.55, backgroundColor: '#F1F5F9' },
  fieldText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: typography.ui,
    paddingVertical: 6,
  },
  placeholder: { color: colors.textMuted },
  caret: {
    fontSize: 16, lineHeight: 16, color: colors.textMuted, marginLeft: 6,
    fontFamily: typography.uiBold,
    ...(Platform.OS === 'web' ? ({ transition: 'transform 120ms ease' } as any) : {}),
  },
  caretOpen: {
    color: colors.brandRed,
    ...(Platform.OS === 'web' ? ({ transform: 'rotate(180deg)' } as any) : {}),
  },
  fieldInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: typography.ui,
    paddingVertical: 6,
  },
  errText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.ui,
    marginTop: 2,
  },

  nativeListWrap: {
    position: 'absolute',
    top: '100%',
    marginTop: 4,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingVertical: 4,
    overflow: 'hidden',
    zIndex: 10000,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  item: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  itemActive: { backgroundColor: '#2563EB' },
  itemPressed: { backgroundColor: '#1D4ED8' },
  itemHighlight: { backgroundColor: '#2563EB' },
  itemText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontFamily: typography.ui,
  },
  itemTextActive: {
    color: colors.brandRed,
    fontFamily: typography.uiBold,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: typography.ui,
    fontStyle: 'italic',
  },
});
