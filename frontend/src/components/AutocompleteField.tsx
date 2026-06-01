import React, { useEffect, useRef, useState } from 'react';
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

const ITEM_HEIGHT = 42;
const VISIBLE_ITEMS = 7;
const MIN_CHARS = 2;

interface Props {
  label: string;
  value: string;
  options: string[];
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
  /** When true, render with mobile-form compact dimensions (38px input, 11px uppercase label, no marginBottom). */
  compact?: boolean;
}

export function AutocompleteField({
  label,
  value,
  options,
  onChangeText,
  placeholder,
  error,
  testID,
  compact,
}: Props) {
  const [focused, setFocused] = useState(false);
  // Whether the dropdown should be visible. Decoupled from `focused` because
  // we want the list to close after selection but reopen automatically when
  // the user types again — without losing focus.
  const [listOpen, setListOpen] = useState(false);
  // Currently highlighted option index — driven by ArrowUp/ArrowDown keys.
  // Reset to 0 whenever the filtered list changes so the user always starts
  // on the first match.
  const [highlightIndex, setHighlightIndex] = useState(0);
  // Whether the dropdown should open ABOVE the input. Computed from the
  // input's distance to the viewport bottom — keeps the popover inside the
  // viewport so the browser never auto-scrolls the page on focus.
  const [openUp, setOpenUp] = useState(false);
  const inputRef = useRef<any>(null);
  // Tracks whether a press is currently in progress on a dropdown item.
  // On web, the TextInput's onBlur fires synchronously when you click a
  // sibling element — so without this guard, the list would unmount before
  // the Pressable's onPress could fire. We set this ref on onPressIn (which
  // fires on mousedown, BEFORE blur) and clear it after the selection commits.
  const pressingRef = useRef(false);

  // Exact match → show every option so user can switch. Below MIN_CHARS the
  // list stays closed; otherwise filter by case-insensitive substring.
  const valTrim = value.trim();
  const valLower = valTrim.toLowerCase();
  const exactMatch = valTrim !== '' && options.some((o) => o.toLowerCase() === valLower);
  const filtered = exactMatch
    ? options
    : valTrim.length >= MIN_CHARS
      ? options.filter((o) => o.toLowerCase().includes(valLower))
      : [];

  const showList = focused && listOpen && filtered.length > 0;

  const handleSelect = (opt: string) => {
    onChangeText(opt);
    // Close the list but DON'T blur — the input stays focused so the next
    // keystroke can reopen the list naturally.
    setListOpen(false);
    pressingRef.current = false;
  };

  // Wrapper around the parent's onChangeText that also reopens the list
  // whenever the user types something new.
  const handleChangeText = (v: string) => {
    onChangeText(v);
    setListOpen(true);
  };

  // Highlight the currently selected option when the list opens; otherwise
  // fall back to the first match.
  useEffect(() => {
    const idx = filtered.findIndex((o) => o.toLowerCase() === valLower);
    setHighlightIndex(idx >= 0 ? idx : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, value]);

  // Decide whether the dropdown should open above the input rather than below.
  // Recomputed each time the list opens so the popover stays inside the
  // viewport — that's what keeps the browser from auto-scrolling the page.
  React.useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !showList || !inputRef.current) return;
    const el: any = inputRef.current;
    if (el && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      const popoverH = ITEM_HEIGHT * Math.min(filtered.length, VISIBLE_ITEMS) + 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < popoverH && rect.top > popoverH);
    }
  }, [showList, filtered.length]);

  // Keyboard navigation on web — attach a real DOM listener while the list
  // is open. This is the only reliable way to capture arrow / Enter / Escape
  // keys, because React Native Web's TextInput and View filter out the
  // `onKeyDown` prop in some versions.
  useEffect(() => {
    if (Platform.OS !== 'web' || !showList) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = filtered[highlightIndex];
        if (opt) {
          onChangeText(opt);
          setListOpen(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setListOpen(false);
      }
    };
    // Capture phase = our listener fires BEFORE the input or any React
    // synthetic handler can stop / consume the event. Required because RNW's
    // TextInput intercepts some keys internally during bubble phase.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [showList, filtered, highlightIndex, onChangeText]);

  // Native onKeyPress handler — kept for iOS/Android. Web uses the document
  // listener above; this one is a no-op there.
  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web') return;
    const key = e?.nativeEvent?.key;
    if (!showList) return;
    if (key === 'Enter') {
      const opt = filtered[highlightIndex];
      if (opt) handleSelect(opt);
    }
  };

  return (
    <View style={[
      styles.wrap,
      compact && styles.wrapCompact,
      showList && { zIndex: 9999, ...(Platform.OS === 'web' ? ({ position: 'relative' } as any) : {}) },
    ]}>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => { setFocused(true); setListOpen(true); }}
        onBlur={() => {
          // Skip closing if user is currently pressing a dropdown item — the
          // press handler will close the list itself once the selection commits.
          if (pressingRef.current) return;
          setFocused(false);
          setListOpen(false);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        // Native uses onKeyPress. Web uses a document-level keydown listener
        // (see useEffect above), so this is a no-op on web.
        onKeyPress={handleKeyPress}
        style={[
          styles.field,
          compact && styles.fieldCompact,
          error ? styles.fieldError : null,
          focused && !showList && styles.fieldFocused,
          showList && (openUp ? styles.fieldOpenUp : styles.fieldOpen),
          Platform.OS === 'web' && ({ outlineStyle: 'none', scrollMarginBlock: '120px' } as any),
        ]}
        testID={testID}
      />
      {error ? <Text style={styles.errText}>{error}</Text> : null}

      {showList ? (
        <View
          style={[styles.listWrap, openUp ? styles.listWrapAbove : styles.listWrapBelow]}
          // On web: preventDefault on mousedown stops the TextInput from
          // blurring at all while the user clicks an option — so the click
          // completes cleanly on the Pressable. This is the standard fix for
          // autocomplete dropdowns and works regardless of timing.
          {...(Platform.OS === 'web'
            ? ({ onMouseDown: (e: any) => e.preventDefault() } as any)
            : {})}
        >
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: ITEM_HEIGHT * VISIBLE_ITEMS }}
            showsVerticalScrollIndicator={filtered.length > VISIBLE_ITEMS}
          >
            {filtered.map((opt, i) => (
              <Pressable
                key={opt}
                onPressIn={() => {
                  pressingRef.current = true;
                  setHighlightIndex(i);
                  handleSelect(opt);
                }}
                onPress={() => handleSelect(opt)}
                onPressOut={() => { pressingRef.current = false; }}
                // Hover highlight on web — keep keyboard + mouse highlight in sync.
                {...(Platform.OS === 'web'
                  ? ({ onMouseEnter: () => setHighlightIndex(i) } as any)
                  : {})}
                style={({ pressed }) => [
                  styles.item,
                  { height: ITEM_HEIGHT },
                  i === highlightIndex && styles.itemHighlight,
                  opt === value && styles.itemActive,
                  pressed && styles.itemPressed,
                ]}
                accessibilityRole="menuitem"
              >
                <Text style={[styles.itemText, (i === highlightIndex || opt === value) && styles.itemTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4, position: 'relative' as const, zIndex: 1 },
  label: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  field: {
    height: 34,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: typography.ui,
  },
  fieldError: { borderColor: colors.danger },
  fieldFocused: { borderColor: '#94A3B8' },
  fieldOpen: { borderColor: '#94A3B8' },
  fieldOpenUp: { borderColor: '#94A3B8' },
  errText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.ui,
    marginTop: 2,
  },
  listWrap: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingVertical: 4,
    overflow: 'hidden',
    zIndex: 99999,
    elevation: 24,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(15,23,42,0.14), 0 4px 10px rgba(15,23,42,0.08)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }),
  },
  listWrapBelow: {
    top: '100%' as any,
    marginTop: 4,
  },
  listWrapAbove: {
    bottom: '100%' as any,
    marginBottom: 4,
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
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
  },

  // Compact variant — used by mobile bilty wizard for tight, balanced rows.
  wrapCompact: { marginBottom: 0 },
  labelCompact: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.uiHeavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  fieldCompact: {
    height: 38,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: typography.uiMedium,
  },
});
