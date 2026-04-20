import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, text } from '../constants/theme';
import { customerService } from '../services/customerService';
import type { CustomerListItem } from '../../../shared/types/customer';

const EMPTY_FORM = {
  name: '',
  phone_number: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
};

type FormErrors = { name?: boolean };

export function CustomersScreen() {
  const [customers, setCustomers] = useState<CustomerListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const list = await customerService.list();
      setCustomers(list);
    } catch {
      setListError('Could not load customers.');
      setCustomers([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openModal = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const onSubmit = useCallback(async () => {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = true;
    setErrs(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const addressParts = [form.address_line1.trim(), form.address_line2.trim()].filter(Boolean);
      await customerService.create({
        name: form.name.trim(),
        phone_number: form.phone_number || null,
        address: addressParts.length ? addressParts.join(', ') : null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
      });
      await load();
      closeModal();
    } catch {
      setFormError('Could not create customer. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, load, closeModal]);

  const columns: Column<CustomerListItem>[] = [
    { key: 'customer_no', label: 'Customer No', width: 160, render: (r) => r.customer_no },
    { key: 'name', label: 'Name', render: (r) => r.name },
    { key: 'phone_number', label: 'Phone', width: 140, render: (r) => r.phone_number || '—' },
    {
      key: 'address', label: 'City / State', width: 200,
      render: (r) => [r.city, r.state].filter(Boolean).join(', ') || '—',
    },
    { key: 'pincode', label: 'Pincode', width: 100, render: (r) => r.pincode || '—' },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <View style={styles.headerBtn}>
          <ButtonPrimary title="New Customer" onPress={openModal} testID="new-customer-btn" />
        </View>
      </View>

      {listError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{listError}</Text>
        </View>
      ) : null}

      {customers === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<CustomerListItem>
            columns={columns}
            rows={customers}
            keyExtractor={(r) => r.id}
            emptyLabel="No customers yet — click New Customer to add one."
            testID="customers-table"
          />
        </View>
      )}

      <Modal visible={modalOpen} onClose={closeModal} title="New Customer" testID="customer-modal">
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <InputField
            label="Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            error={errs.name ? 'Required' : null}
            testID="customer-name-input"
          />
          <InputField
            label="Phone Number"
            value={form.phone_number}
            onChangeText={(v) => setForm((f) => ({ ...f, phone_number: v }))}
            fieldType="phone"
            testID="customer-phone-input"
          />
          <InputField
            label="Address Line 1"
            value={form.address_line1}
            onChangeText={(v) => setForm((f) => ({ ...f, address_line1: v }))}
            hint="House / Flat No., Building Name, Floor"
            testID="customer-address1-input"
          />
          <InputField
            label="Address Line 2"
            value={form.address_line2}
            onChangeText={(v) => setForm((f) => ({ ...f, address_line2: v }))}
            hint="Nearby Landmark, Colony, Area"
            testID="customer-address2-input"
          />
          <InputField
            label="City"
            value={form.city}
            onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
            testID="customer-city-input"
          />
          <View style={styles.formRow}>
            <View style={styles.formRowState}>
              <InputField
                label="State"
                value={form.state}
                onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                testID="customer-state-input"
              />
            </View>
            <View style={styles.formRowPin}>
              <InputField
                label="Pincode"
                value={form.pincode}
                onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))}
                fieldType="integer"
                testID="customer-pincode-input"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="customer-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title="Save Customer"
                onPress={onSubmit}
                loading={submitting}
                testID="customer-submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.lg,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  headerBtn: { minWidth: 150 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  formScroll: { maxHeight: 520 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  formRowState: { flex: 2 },
  formRowPin: { flex: 1, minWidth: 90 },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 130 },
});
