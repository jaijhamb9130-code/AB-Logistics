import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Modal } from './Modal';
import { InputField } from './InputField';
import { SelectDropdown } from './SelectDropdown';
import { AutocompleteField } from './AutocompleteField';
import { ButtonPrimary } from './ButtonPrimary';
import { colors, radius, spacing, typography } from '../constants/theme';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { destinationService } from '../services/destinationService';
import { branchService } from '../services/branchService';
import { vehicleMasterService } from '../services/vehicleMasterService';
import { itemMasterService } from '../services/itemMasterService';
import { itemGroupService } from '../services/itemGroupService';
import { itemCategoryService } from '../services/itemCategoryService';

// --- Ledger Quick Create Modal ---
interface LedgerQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  initialName: string;
  defaultGroupName: 'Consignor' | 'Consignee' | 'Agent' | 'Sundry Debtors';
}

export function LedgerQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
  defaultGroupName,
}: LedgerQuickCreateProps) {
  const [name, setName] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [ledgerGroupId, setLedgerGroupId] = useState<number>(0);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setGstNo('');
      setAddress('');
      setCity('');
      setState('');
      setPincode('');
      setFormError(null);
      setNameError(null);

      ledgerGroupService.list()
        .then((rs) => {
          setGroups(rs);
          const matched = rs.find(
            (g: any) => g.group_name.toLowerCase() === defaultGroupName.toLowerCase()
          );
          if (matched) {
            setLedgerGroupId(matched.id);
          }
        })
        .catch(() => {});
    }
  }, [visible, initialName, defaultGroupName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Name is required.');
      return;
    }
    setNameError(null);
    setFormError(null);
    setLoading(true);

    try {
      await ledgerMasterService.create({
        name: name.trim(),
        ledger_group_id: ledgerGroupId || 0,
        gst_no: gstNo.trim().toUpperCase() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        billbybill: 'Yes',
      });
      onSuccess(name.trim());
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'name_taken') setFormError('A ledger with that name already exists.');
      else setFormError(err?.response?.data?.message || 'Could not create ledger. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={`Quick Create ${defaultGroupName}`}>
      <View style={{ gap: spacing.md }}>
        {formError && (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}
        <InputField
          label="Name *"
          value={name}
          onChangeText={setName}
          error={nameError}
        />
        <SelectDropdown
          label="Ledger Group *"
          value={groups.find((g) => g.id === ledgerGroupId)?.group_name ?? ''}
          options={groups.map((g) => g.group_name)}
          onSelect={(groupName) => {
            const matched = groups.find((g) => g.group_name === groupName);
            if (matched) setLedgerGroupId(matched.id);
          }}
        />
        <InputField
          label="GST No"
          value={gstNo}
          onChangeText={(v) => setGstNo(v.toUpperCase())}
          autoCapitalize="characters"
        />
        <InputField
          label="Address"
          value={address}
          onChangeText={setAddress}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <InputField
              label="City"
              value={city}
              onChangeText={setCity}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="State"
              value={state}
              onChangeText={setState}
            />
          </View>
        </View>
        <InputField
          label="Pincode"
          value={pincode}
          onChangeText={setPincode}
          fieldType="integer"
        />
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.submitWrap}>
            <ButtonPrimary
              title="Create"
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Destination Quick Create Modal ---
interface DestinationQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  initialName: string;
}

export function DestinationQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
}: DestinationQuickCreateProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setFormError(null);
      setNameError(null);
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Destination name is required.');
      return;
    }
    setNameError(null);
    setFormError(null);
    setLoading(true);

    try {
      await destinationService.create({
        name: name.trim(),
        branch: null,
      });
      onSuccess(name.trim());
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Could not create destination. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Quick Create Destination">
      <View style={{ gap: spacing.md }}>
        {formError && (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}
        <InputField
          label="Destination Name *"
          value={name}
          onChangeText={setName}
          error={nameError}
          fieldType="letters"
        />
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.submitWrap}>
            <ButtonPrimary
              title="Create"
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Branch Quick Create Modal ---
interface BranchQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  initialName: string;
}

export function BranchQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
}: BranchQuickCreateProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setFormError(null);
      setNameError(null);
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Branch name is required.');
      return;
    }
    setNameError(null);
    setFormError(null);
    setLoading(true);

    try {
      await branchService.create({
        name: name.trim(),
      });
      onSuccess(name.trim());
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Could not create branch. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Quick Create Branch">
      <View style={{ gap: spacing.md }}>
        {formError && (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}
        <InputField
          label="Branch Name *"
          value={name}
          onChangeText={setName}
          error={nameError}
        />
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.submitWrap}>
            <ButtonPrimary
              title="Create"
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Vehicle Quick Create Modal ---
interface VehicleQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  initialName: string;
}

export function VehicleQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
}: VehicleQuickCreateProps) {
  const [name, setName] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [ledgerGroup, setLedgerGroup] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [panNo, setPanNo] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [groups, setGroups] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setName(initialName.toUpperCase());
      setVehicleType('');
      setLedgerGroup('');
      setMobile('');
      setGstNo('');
      setPanNo('');
      setAddress('');
      setCity('');
      setState('');
      setPincode('');
      setFormError(null);
      setNameError(null);
      setOwnerError(null);

      ledgerGroupService.list()
        .then((rs) => setGroups(rs.map((r) => r.group_name).sort()))
        .catch(() => {});
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Vehicle number is required.');
      return;
    }
    if (!ledgerGroup.trim()) {
      setOwnerError('Owner name is required.');
      return;
    }
    setNameError(null);
    setOwnerError(null);
    setFormError(null);
    setLoading(true);

    try {
      await vehicleMasterService.create({
        name: name.trim().toUpperCase(),
        vehicle_no: name.trim().toUpperCase(),
        vehicle_type: vehicleType.trim() || null,
        ledger_group: ledgerGroup.trim() || null,
        mobile: mobile.trim() || null,
        gst_no: gstNo.trim().toUpperCase() || null,
        pan_no: panNo.trim().toUpperCase() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
      });
      onSuccess(name.trim().toUpperCase());
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'name_taken') setFormError('A vehicle with that number already exists.');
      else setFormError(err?.response?.data?.message || 'Could not create vehicle. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Quick Create Vehicle">
      <View style={{ gap: spacing.md }}>
        {formError && (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}
        <InputField
          label="Vehicle Number *"
          value={name}
          onChangeText={(v) => setName(v.toUpperCase())}
          error={nameError}
          fieldType="alphanumeric"
          autoCapitalize="characters"
        />
        <InputField
          label="Vehicle Type"
          value={vehicleType}
          onChangeText={setVehicleType}
        />
        <AutocompleteField
          label="Owner Name *"
          value={ledgerGroup}
          options={groups}
          onChangeText={setLedgerGroup}
          error={ownerError}
        />
        <InputField
          label="Mobile"
          value={mobile}
          onChangeText={setMobile}
          fieldType="phone"
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <InputField
              label="GST No"
              value={gstNo}
              onChangeText={(v) => setGstNo(v.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="PAN No"
              value={panNo}
              onChangeText={(v) => setPanNo(v.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>
        </View>
        <InputField
          label="Address"
          value={address}
          onChangeText={setAddress}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <InputField
              label="City"
              value={city}
              onChangeText={setCity}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="State"
              value={state}
              onChangeText={setState}
            />
          </View>
        </View>
        <InputField
          label="Pincode"
          value={pincode}
          onChangeText={setPincode}
          fieldType="integer"
        />
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.submitWrap}>
            <ButtonPrimary
              title="Create"
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Item Group Quick Create Modal ---
interface ItemGroupQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string, id: number) => void;
  initialName: string;
}

export function ItemGroupQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
}: ItemGroupQuickCreateProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setFormError(null);
      setNameError(null);
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Group name is required.');
      return;
    }
    setNameError(null);
    setFormError(null);
    setLoading(true);

    try {
      const res = await itemGroupService.create({
        group_name: name.trim(),
        parent_id: null,
      });
      onSuccess(name.trim(), res.id);
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Could not create item group. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Quick Create Item Group">
      <View style={{ gap: spacing.md }}>
        {formError && (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}
        <InputField
          label="Item Group Name *"
          value={name}
          onChangeText={setName}
          error={nameError}
        />
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.submitWrap}>
            <ButtonPrimary
              title="Create"
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Item Category Quick Create Modal ---
interface ItemCategoryQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string, id: number) => void;
  initialName: string;
}

export function ItemCategoryQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
}: ItemCategoryQuickCreateProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setFormError(null);
      setNameError(null);
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Category name is required.');
      return;
    }
    setNameError(null);
    setFormError(null);
    setLoading(true);

    try {
      const res = await itemCategoryService.create({
        category_name: name.trim(),
        parent_id: null,
      });
      onSuccess(name.trim(), res.id);
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Could not create item category. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Quick Create Item Category">
      <View style={{ gap: spacing.md }}>
        {formError && (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}
        <InputField
          label="Item Category Name *"
          value={name}
          onChangeText={setName}
          error={nameError}
        />
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.submitWrap}>
            <ButtonPrimary
              title="Create"
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Item (Goods Type) Quick Create Modal ---
interface ItemQuickCreateProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  initialName: string;
}

export function ItemQuickCreateModal({
  visible,
  onClose,
  onSuccess,
  initialName,
}: ItemQuickCreateProps) {
  const [name, setName] = useState('');
  const [batch, setBatch] = useState('No');
  const [gstRate, setGstRate] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [unit, setUnit] = useState('');

  const [itemGroupId, setItemGroupId] = useState(0);
  const [itemCategoryId, setItemCategoryId] = useState(0);

  const [groups, setGroups] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errs, setErrs] = useState<any>({});

  const refreshGroupsAndCategories = () => {
    itemGroupService.list().then(setGroups).catch(() => setGroups([]));
    itemCategoryService.list().then(setCategories).catch(() => setCategories([]));
  };

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setBatch('No');
      setGstRate('');
      setHsnCode('');
      setUnit('');
      setItemGroupId(0);
      setItemCategoryId(0);
      setFormError(null);
      setErrs({});
      refreshGroupsAndCategories();
    }
  }, [visible, initialName]);

  const handleSave = async () => {
    const e: any = {};
    if (!name.trim()) e.name = 'Item name is required.';
    if (!itemGroupId) e.item_group_id = 'Item Group is required.';
    if (!itemCategoryId) e.item_category_id = 'Item Category is required.';

    setErrs(e);
    if (Object.keys(e).length > 0) return;

    setFormError(null);
    setLoading(true);

    try {
      await itemMasterService.create({
        name: name.trim(),
        hsn_code: hsnCode.trim().toUpperCase() || null,
        gst_rate: gstRate.trim() === '' ? null : Number(gstRate),
        unit: unit.trim() || null,
        batch: batch === 'Yes' ? 'Yes' : 'No',
        opening_qty: 0,
        opening_rate: 0,
        opening_value: 0,
        item_group_id: itemGroupId || null,
        item_category_id: itemCategoryId || null,
        batches: [],
      });
      onSuccess(name.trim());
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'name_taken') setFormError('An item with that name already exists.');
      else setFormError(err?.response?.data?.message || 'Could not create item. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal visible={visible} onClose={onClose} title="Quick Create Item (Goods Type)">
        <View style={{ gap: spacing.md }}>
          {formError && (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <InputField
                label="Item Name *"
                value={name}
                onChangeText={setName}
                error={errs.name ?? null}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SelectDropdown
                label="Batch"
                value={batch}
                options={['No', 'Yes']}
                onSelect={setBatch}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <SelectDropdown
                label="Item Group *"
                value={groups.find((g) => g.id === itemGroupId)?.group_name ?? ''}
                options={groups.map((g) => g.group_name)}
                onSelect={(gName) => {
                  const matched = groups.find((g) => g.group_name === gName);
                  if (matched) setItemGroupId(matched.id);
                }}
                searchable
                error={errs.item_group_id}
                onCreatePressed={() => setGroupModalOpen(true)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SelectDropdown
                label="Item Category *"
                value={categories.find((c) => c.id === itemCategoryId)?.category_name ?? ''}
                options={categories.map((c) => c.category_name)}
                onSelect={(cName) => {
                  const matched = categories.find((c) => c.category_name === cName);
                  if (matched) setItemCategoryId(matched.id);
                }}
                searchable
                error={errs.item_category_id}
                onCreatePressed={() => setCategoryModalOpen(true)}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <InputField
                label="GST %"
                value={gstRate}
                onChangeText={setGstRate}
                fieldType="decimal"
                placeholder="0"
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                label="HSN Code"
                value={hsnCode}
                onChangeText={(v) => setHsnCode(v.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                label="Unit"
                value={unit}
                onChangeText={setUnit}
                placeholder="e.g. ton/kg/bag"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title="Create"
                onPress={handleSave}
                loading={loading}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ItemGroupQuickCreateModal
        visible={groupModalOpen}
        initialName=""
        onClose={() => setGroupModalOpen(false)}
        onSuccess={(gName, gId) => {
          setGroups((prev) => [...prev, { id: gId, group_name: gName }]);
          setItemGroupId(gId);
          setGroupModalOpen(false);
        }}
      />

      <ItemCategoryQuickCreateModal
        visible={categoryModalOpen}
        initialName=""
        onClose={() => setCategoryModalOpen(false)}
        onSuccess={(cName, cId) => {
          setCategories((prev) => [...prev, { id: cId, category_name: cName }]);
          setItemCategoryId(cId);
          setCategoryModalOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  formError: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formErrorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.ui,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: typography.uiBold,
  },
  submitWrap: {
    minWidth: 120,
  },
});
