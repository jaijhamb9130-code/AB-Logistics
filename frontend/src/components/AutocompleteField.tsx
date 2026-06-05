import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
// Once this many chars are typed with zero matches, show a "No <label> found" hint.
const NO_RESULT_CHARS = 3;

// Lazy ReactDOM for the optional web body-portal. Rendering the dropdown into
// document.body escapes ancestor overflow clipping (e.g. a Modal's ScrollView).
// Mirrors the RowDatalist portal used inside the bilty items table.
const AutocompleteReactDOM: any = Platform.OS === 'web' ? require('react-dom') : null;

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
  /**
   * Guided entry: invoked when Enter is pressed AND the field holds a VALID
   * selection (a value matching one of `options`). When set, the field refuses
   * to advance on free text that isn't a listed option — forcing a pick.
   */
  onSubmitNext?: () => void;
  /**
   * Guided entry: when true, Enter advances on any NON-EMPTY value even if it
   * isn't a listed option (used for fields with no connected master, e.g. Owner).
   * When false/undefined, a listed selection is required to advance.
   */
  submitFreeText?: boolean;
  /**
   * Guided entry: when true, Enter/Tab ALWAYS advance via onSubmitNext — even on
   * an empty or non-matching value. Makes the field fully skippable (still picks
   * a highlighted match if one is showing). Takes precedence over the gating.
   */
  submitAlways?: boolean;
  /**
   * Render the dropdown into a web body-portal (position: fixed) so it can't be
   * clipped by an ancestor with overflow (e.g. a Modal's ScrollView). Web-only;
   * native falls back to the in-flow absolute list.
   */
  usePortal?: boolean;
  /** Optional style override for the inner text input (e.g. larger/bold value text). */
  inputStyle?: any;
}

export type AutocompleteHandle = { focus: () => void };

export const AutocompleteField = forwardRef<AutocompleteHandle, Props>(function AutocompleteField({
  label,
  value,
  options,
  onChangeText,
  placeholder,
  error,
  testID,
  compact,
  onSubmitNext,
  submitFreeText,
  submitAlways,
  usePortal,
  inputStyle,
}: Props, ref) {
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
  // Web body-portal anchor (viewport coords). Only used when `usePortal` is set.
  const wrapRef = useRef<any>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<any>(null);
  // Tracks whether a press is currently in progress on a dropdown item.
  // On web, the TextInput's onBlur fires synchronously when you click a
  // sibling element — so without this guard, the list would unmount before
  // the Pressable's onPress could fire. We set this ref on onPressIn (which
  // fires on mousedown, BEFORE blur) and clear it after the selection commits.
  const pressingRef = useRef(false);

  // Expose focus() so guided-entry parents can move the cursor to this field.
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus?.() }), []);

  // On web the dropdown ALWAYS renders through the body-portal (position: fixed)
  // so it can never be clipped by an ancestor's overflow — modals, scroll areas,
  // cards, etc. This is the default for EVERY field; callers may still opt out
  // explicitly with usePortal={false}. Native always uses the in-flow list.
  const portalEnabled = Platform.OS === 'web' && usePortal !== false;

  // Filter by case-insensitive substring once MIN_CHARS are typed. The list
  // always reflects exactly what's typed — we deliberately do NOT "show all
  // options on an exact match", so it never displays unrelated names after a
  // full value has been entered or selected.
  const valTrim = value.trim();
  const valLower = valTrim.toLowerCase();
  // A field with NO options is a plain free-entry input (e.g. a "Name" / "Prefix"
  // you're creating fresh) — there's nothing to autocomplete, so it must never
  // show a dropdown or a "No X found" hint. Everything below short-circuits on this.
  const hasOptions = options.length > 0;
  const filtered = hasOptions && valTrim.length >= MIN_CHARS
    ? options.filter((o) => o.toLowerCase().includes(valLower))
    : [];

  // When enough has been typed but nothing matches, surface a "No <label>
  // found" hint instead of silently hiding the dropdown. Strip a trailing
  // required-marker " *" from the label so it reads "No Consignor found".
  const cleanLabel = label.replace(/\s*\*\s*$/, '').trim();
  const showNoResults =
    hasOptions && focused && listOpen && filtered.length === 0 && valTrim.length >= NO_RESULT_CHARS;
  const showList = (focused && listOpen && filtered.length > 0) || showNoResults;

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
    // Lock behaviour: once the field holds a COMPLETE, valid option, block any
    // keystroke that APPENDS to it (typing more) — the user may only backspace
    // / delete to change the value. This prevents junk like
    // "Adani Logisticsbhus" after the entry has been selected. Deletions and
    // replacements (shorter values) are always allowed, which re-enables typing.
    const isCompleteValue = valTrim !== '' && options.some((o) => o.toLowerCase() === valLower);
    const isAppending = v.length > value.length && v.toLowerCase().startsWith(valLower);
    if (isCompleteValue && isAppending) return;
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

  // Portal mode: measure the input's viewport rect so the body-portal dropdown
  // can be positioned with `position: fixed` (escapes any overflow clipping).
  // Re-measures on scroll/resize so it tracks the field.
  React.useLayoutEffect(() => {
    if (!portalEnabled || !showList) return;
    const measure = () => {
      // Measure the wrapping View — RNW's TextInput ref isn't reliably a DOM
      // node, but the surrounding View always is (same trick as RowDatalist).
      const el: any = wrapRef.current;
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      const rect = el.getBoundingClientRect();
      const popoverH = ITEM_HEIGHT * Math.min(Math.max(filtered.length, 1), VISIBLE_ITEMS) + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const up = spaceBelow < popoverH && rect.top > popoverH;
      setOpenUp(up);
      setAnchor({
        top: up ? rect.top - popoverH - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [portalEnabled, showList, filtered.length]);

  // Keyboard navigation on web — attach a real DOM listener while the list
  // is open. This is the only reliable way to capture arrow / Enter / Escape
  // keys, because React Native Web's TextInput and View filter out the
  // `onKeyDown` prop in some versions.
  useEffect(() => {
    if (Platform.OS !== 'web' || !showList) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        if (filtered.length === 0) return;
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        if (filtered.length === 0) return;
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && !!onSubmitNext)) {
        // Enter always selects the highlighted option. In guided mode, Tab is
        // intercepted too and gated the same way: advance only on a valid pick
        // (or non-empty free text); otherwise block so the user must choose a
        // listed option. preventDefault stops Tab's native focus move.
        e.preventDefault();
        const opt = filtered[highlightIndex];
        if (opt) {
          onChangeText(opt);
          setListOpen(false);
          onSubmitNext?.();
        } else if (onSubmitNext && (submitAlways || (submitFreeText && valTrim !== ''))) {
          // Skippable / free-text field → advance even without a listed match.
          setListOpen(false);
          onSubmitNext();
        }
        // Otherwise (forced-selection field with no match) → do nothing, which
        // keeps focus here and forces the user to pick a listed option.
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
  }, [showList, filtered, highlightIndex, onChangeText, onSubmitNext, submitAlways, submitFreeText, valTrim]);

  // Guided entry, web: when the field is focused but the list is CLOSED, both
  // Enter and Tab advance ONLY if a valid option is selected (or non-empty free
  // text). Otherwise the key is swallowed — focus stays put, forcing a pick.
  useEffect(() => {
    if (Platform.OS !== 'web' || !onSubmitNext || !focused || showList) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && !(e.key === 'Tab' && !e.shiftKey)) return;
      e.preventDefault();
      const isValid = valTrim !== '' && options.some((o) => o.toLowerCase() === valLower);
      if (isValid || submitAlways || (submitFreeText && valTrim !== '')) onSubmitNext();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [focused, showList, onSubmitNext, submitFreeText, submitAlways, valTrim, valLower, options]);

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
    <View
      ref={wrapRef}
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        showList && { zIndex: 9999, ...(Platform.OS === 'web' ? ({ position: 'relative' } as any) : {}) },
      ]}
    >
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
          inputStyle,
        ]}
        testID={testID}
      />
      {error ? <Text style={styles.errText}>{error}</Text> : null}

      {/* Web body-portal dropdown — escapes ancestor overflow clipping (e.g. a
          Modal's ScrollView). The highlight bar is GREY; the picked value is blue. */}
      {showList && portalEnabled && AutocompleteReactDOM && anchor
        ? AutocompleteReactDOM.createPortal(
            <div
              onMouseDown={(e: any) => e.preventDefault()}
              style={{
                position: 'fixed', top: anchor.top, left: anchor.left, width: anchor.width,
                zIndex: 2147483647, background: '#FFFFFF', border: '1px solid #E2E8F0',
                borderRadius: 8, boxShadow: '0 12px 28px rgba(15,23,42,0.14), 0 4px 10px rgba(15,23,42,0.08)',
                paddingTop: 4, paddingBottom: 4, maxHeight: ITEM_HEIGHT * VISIBLE_ITEMS + 8,
                overflowY: 'auto', boxSizing: 'border-box',
              }}
            >
              {filtered.length === 0 ? (
                <div style={{ height: ITEM_HEIGHT, display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, fontSize: 13, fontStyle: 'italic', color: '#64748B', fontFamily: 'inherit' }}>
                  No {cleanLabel} found
                </div>
              ) : null}
              {filtered.map((opt, i) => {
                const isHi = i === highlightIndex;
                const isActive = opt === value;
                return (
                  <div
                    key={opt}
                    onMouseEnter={() => setHighlightIndex(i)}
                    onMouseDown={(e: any) => { e.preventDefault(); pressingRef.current = true; handleSelect(opt); }}
                    style={{
                      height: ITEM_HEIGHT, display: 'flex', alignItems: 'center',
                      paddingLeft: 12, paddingRight: 12, cursor: 'pointer', userSelect: 'none',
                      background: isActive ? '#2563EB' : isHi ? '#EEF2F7' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#0F172A',
                      fontSize: 14, lineHeight: '20px', fontFamily: 'inherit',
                      fontWeight: (isActive || isHi) ? 700 : 500,
                    }}
                  >
                    {opt}
                  </div>
                );
              })}
            </div>,
            document.body
          )
        : null}

      {showList && (!portalEnabled || !anchor) ? (
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
          {filtered.length === 0 ? (
            <View style={[styles.item, { height: ITEM_HEIGHT }]}>
              <Text style={styles.noResultText}>No {cleanLabel} found</Text>
            </View>
          ) : (
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
                <Text style={[styles.itemText, opt === value && styles.itemTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
});

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
  // Picked value = blue (white text); hover/keyboard highlight = grey bar (the
  // app's standard), so the two are easy to tell apart in the list.
  itemActive: { backgroundColor: '#2563EB' },
  itemPressed: { backgroundColor: '#1D4ED8' },
  itemHighlight: { backgroundColor: '#EEF2F7' },
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
  noResultText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    fontFamily: typography.ui,
    fontStyle: 'italic',
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
