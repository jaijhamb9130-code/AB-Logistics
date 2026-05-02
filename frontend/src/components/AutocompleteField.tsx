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
const MIN_CHARS = 3;

interface Props {
  label: string;
  value: string;
  options: string[];
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
}

export function AutocompleteField({
  label,
  value,
  options,
  onChangeText,
  placeholder,
  error,
  testID,
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
  // Tracks whether a press is currently in progress on a dropdown item.
  // On web, the TextInput's onBlur fires synchronously when you click a
  // sibling element — so without this guard, the list would unmount before
  // the Pressable's onPress could fire. We set this ref on onPressIn (which
  // fires on mousedown, BEFORE blur) and clear it after the selection commits.
  const pressingRef = useRef(false);

  const filtered =
    value.length >= MIN_CHARS
      ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
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

  // Reset highlight to the first match whenever the filtered list shifts.
  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length, value]);

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
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
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
          error ? styles.fieldError : null,
          focused && !showList && styles.fieldFocused,
          showList && styles.fieldOpen,
          Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
        ]}
        testID={testID}
      />
      {error ? <Text style={styles.errText}>{error}</Text> : null}

      {showList ? (
        <View
          style={styles.listWrap}
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
                <Text style={[styles.itemText, opt === value && styles.itemTextActive]}>
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
  wrap: { marginBottom: spacing.sm },
  label: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  field: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontFamily: typography.ui,
  },
  fieldError: { borderColor: colors.danger },
  fieldFocused: { borderColor: colors.brandRed, borderWidth: 2 },
  fieldOpen: {
    borderColor: colors.brandRed,
    borderWidth: 2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  errText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.ui,
    marginTop: 2,
  },
  listWrap: {
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: colors.brandRed,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  item: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemActive: { backgroundColor: '#FEF2F2' },
  itemPressed: { backgroundColor: '#F5F7FA' },
  // Highlighted via keyboard arrows or mouse hover — light grey background.
  itemHighlight: { backgroundColor: '#EEF2F7' },
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
});
