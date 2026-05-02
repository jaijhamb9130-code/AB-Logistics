import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

const ITEM_HEIGHT = 42;
const VISIBLE_ITEMS = 7;

interface Props {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
}

export function SelectDropdown({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Select...',
  error,
  testID,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={[styles.field, error ? styles.fieldError : null, open && styles.fieldOpen]}
        accessibilityRole="button"
        testID={testID}
      >
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {error ? <Text style={styles.errText}>{error}</Text> : null}

      {open ? (
        <View style={styles.listWrap}>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: ITEM_HEIGHT * VISIBLE_ITEMS }}
            showsVerticalScrollIndicator={options.length > VISIBLE_ITEMS}
          >
            {options.length === 0 ? (
              <View style={[styles.item, { height: ITEM_HEIGHT }]}>
                <Text style={styles.emptyText}>No options yet — add a customer first</Text>
              </View>
            ) : (
              options.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                  style={({ pressed }) => [
                    styles.item,
                    { height: ITEM_HEIGHT },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  fieldError: { borderColor: colors.danger },
  fieldOpen: {
    borderColor: colors.brandRed,
    borderWidth: 2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  fieldText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontFamily: typography.ui,
  },
  placeholder: { color: colors.textMuted },
  caret: { fontSize: 11, color: colors.textMuted, marginLeft: 6 },
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
