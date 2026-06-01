import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';
import { ProfilePanel } from './ProfilePanel';
import { MobileDrawer, type DrawerNavItem } from './MobileDrawer';
import { colors, typography } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';

export const TOP_NAV_HEIGHT = 66;
export const TOP_NAV_HEIGHT_MOBILE = 56;

const LABELS: Record<string, string> = {
  Dashboard: 'Dashboard',
  Bilty: 'Bilty',
  Freight: 'Freight',
  Billing: 'Vouchers',
  LedgerMaster: 'Ledger Master',
  Customers: 'Customers',
  OtherLedgers: 'Other Ledgers',
  OwnerMaster: 'Owner Master',
  AgentMaster: 'Agent Master',
  ItemMaster: 'Item Master',
  ItemGroup: 'Item Group',
  ItemCategory: 'Item Category',
  VehicleMaster: 'Vehicle Master',
  DestinationMaster: 'Destination Master',
  BranchMaster: 'Branch Master',
  ZoneMaster: 'Zone Master',
  LedgerGroups: 'Ledger Groups',
  Users: 'Users',
};

// Explicit left-to-right display order of nav items.
// Users is hidden from nav and accessed via the profile panel.
// LedgerGroups is hidden from nav and lives at the bottom of the Ledger dropdown.
const NAV_ORDER = ['Dashboard', 'Ledger', 'Bilty', 'Freight', 'Billing'];

// Routes grouped under the "Ledger" dropdown — hidden as top-level nav items.
// Order here = order shown inside the dropdown (matches the user's requested sequence).
// LedgerGroups sits at the bottom of this list.
const LEDGER_ROUTES = [
  'LedgerMaster',
  'Customers',
  'OtherLedgers',
  'OwnerMaster',
  'AgentMaster',
  'ItemMaster',
  'ItemGroup',
  'ItemCategory',
  'VehicleMaster',
  'DestinationMaster',
  'BranchMaster',
  'ZoneMaster',
  'LedgerGroups',
];

// Routes that live as children under the "Item Master" parent in the
// Ledger dropdown. They DO NOT appear as flat dropdown rows.
const ITEM_MASTER_CHILD_ROUTES = ['ItemGroup', 'ItemCategory'];
// Routes that live as children under the "Ledger Master" parent in the
// Ledger dropdown. Same convention as ITEM_MASTER_CHILD_ROUTES.
const LEDGER_MASTER_CHILD_ROUTES = ['Customers', 'OtherLedgers'];
const HIDDEN_FROM_NAV = [...LEDGER_ROUTES, 'Users'];

export function TopNavBar({ state, navigation }: BottomTabBarProps) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<null | 'ledger' | 'billing'>(null);
  const { isMobile } = useResponsive();

  const initials = (user?.username ?? 'AD').slice(0, 2).toUpperCase();

  const activeRouteName = state.routes[state.index]?.name ?? '';
  const ledgerActive = LEDGER_ROUTES.includes(activeRouteName);
  const billingActive = activeRouteName === 'Billing';

  // Which ledger/reports targets exist in the navigator (permission-gated by AppTabs).
  // Item Group / Item Category are NESTED under "Item Master" in the dropdown,
  // so they're filtered out of the flat list here. We then synthesize the
  // "LedgerMaster" / "ItemMaster" PARENT entries whenever any of their
  // children are mounted, even if the parent tab itself isn't — that way
  // a user with only `customermaster.view` (and no `ledgermaster.view`)
  // still gets a "Ledger Master" header in the dropdown that expands to
  // show Customers.
  const flatLedgerTargets = state.routes
    .filter((r) =>
      LEDGER_ROUTES.includes(r.name)
      && !ITEM_MASTER_CHILD_ROUTES.includes(r.name)
      && !LEDGER_MASTER_CHILD_ROUTES.includes(r.name)
    )
    .map((r) => r.name);

  const hasAnyLedgerMasterChild = state.routes.some(
    (r) => LEDGER_MASTER_CHILD_ROUTES.includes(r.name),
  );
  const hasAnyItemMasterChild = state.routes.some(
    (r) => ITEM_MASTER_CHILD_ROUTES.includes(r.name),
  );

  const availableLedgerTargets: string[] = [];
  for (const name of LEDGER_ROUTES) {
    if (ITEM_MASTER_CHILD_ROUTES.includes(name)) continue;
    if (LEDGER_MASTER_CHILD_ROUTES.includes(name)) continue;
    if (flatLedgerTargets.includes(name)) {
      availableLedgerTargets.push(name);
    } else if (name === 'LedgerMaster' && hasAnyLedgerMasterChild) {
      availableLedgerTargets.push(name);
    } else if (name === 'ItemMaster' && hasAnyItemMasterChild) {
      availableLedgerTargets.push(name);
    }
  }
  const hasBilling = state.routes.some((r) => r.name === 'Billing');

  // Read the active screen inside the nested BillingStack so the dropdown can
  // highlight whichever sub-item (Add Voucher / Daybook) the user is on.
  const billingRoute = state.routes.find((r) => r.name === 'Billing');
  const billingNestedState: any = (billingRoute as any)?.state;
  const billingActiveScreen: string =
    billingNestedState?.routes?.[billingNestedState.index]?.name ?? 'VouchersList';

  const navigateTo = (routeName: string, params?: object) => {
    const target = state.routes.find((r) => r.name === routeName);
    if (!target) return;
    // Always navigate (even if tab is already active) so params reach the screen.
    navigation.navigate(routeName as never, params as never);
    setOpenDropdown(null);
  };

  // Build the flat list of drawer nav items for mobile (mirrors desktop nav).
  const drawerItems: DrawerNavItem[] = isMobile
    ? buildDrawerItems({
        availableLedgerTargets,
        hasBilling,
        activeRouteName,
        billingActiveScreen,
        ledgerActive,
        billingActive,
        hasItemMaster: state.routes.some((r) => r.name === 'ItemMaster'),
        hasItemGroup: state.routes.some((r) => r.name === 'ItemGroup'),
        hasItemCategory: state.routes.some((r) => r.name === 'ItemCategory'),
        hasCustomers: state.routes.some((r) => r.name === 'Customers'),
        hasOtherLedgers: state.routes.some((r) => r.name === 'OtherLedgers'),
        canCreateVoucher: canDoAction(user, 'voucher', 'create'),
        // voucher.view also gets a Daybook entry — see desktop dropdown comment.
        canViewDaybook:
          canDoAction(user, 'daybook', 'view') || canDoAction(user, 'voucher', 'view'),
        // Bilty drawer entry uses the strict bilty.view check — voucher-only
        // users mount the tab but don't see it as a nav target.
        canViewBilty: canDoAction(user, 'bilty', 'view'),
        navigateTo: (n, p) => {
          navigateTo(n, p);
          setDrawerOpen(false);
        },
        hasUsers: state.routes.some((r) => r.name === 'Users'),
      })
    : [];

  if (isMobile) {
    return (
      <>
        <View style={{ height: 0 }} />
        <View style={[styles.bar, styles.barMobile]}>
          <Pressable
            onPress={() => setDrawerOpen(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.hamburger, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </Pressable>

          <View style={styles.logoWrapMobile}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>AB</Text>
            </View>
            <Text style={styles.logoWordmarkMobile}>LOGISTICS</Text>
          </View>

          <Pressable
            onPress={() => setProfileOpen((v) => !v)}
            style={({ pressed }) => [styles.avatar, styles.avatarMobile, pressed && styles.avatarPressed]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </Pressable>
        </View>

        <MobileDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          user={user}
          items={drawerItems}
          onLogout={() => {
            setDrawerOpen(false);
            logout();
          }}
        />

        <ProfilePanel
          visible={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={user}
          logout={logout}
          onNavigate={(tab) => {
            setProfileOpen(false);
            navigation.navigate(tab as any);
          }}
        />
      </>
    );
  }

  return (
    <>
      {/* Zero-height placeholder — tells React Navigation the tab bar takes no bottom space */}
      <View style={{ height: 0 }} />

      {/* Actual nav bar — absolutely locked to the top of the screen */}
      <View style={styles.bar}>
        {/* ── Logo ── */}
        <View style={styles.logoWrap}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>AB</Text>
          </View>
          <Text style={styles.logoWordmark}>LOGISTICS</Text>
        </View>

        {/* ── Nav items — rendered in explicit display order ── */}
        <View style={styles.navItems}>
          {NAV_ORDER.map((name) => {
            if (name === 'Ledger') {
              return availableLedgerTargets.length > 0 ? (
                <DropdownNavItem
                  key="ledger"
                  label="Ledger"
                  active={ledgerActive}
                  activeKey={activeRouteName}
                  isOpen={openDropdown === 'ledger'}
                  onToggle={() => setOpenDropdown((v) => (v === 'ledger' ? null : 'ledger'))}
                  onClose={() => setOpenDropdown(null)}
                  items={availableLedgerTargets.map((n) => {
                    if (n === 'LedgerMaster') {
                      // Nested submenu: Customers / Other Ledgers. The parent
                      // itself does NOT navigate — clicking the label is a
                      // no-op so the user picks one of the two children. This
                      // matches the user's spec ("just expand").
                      const hasCustomers = state.routes.some((r) => r.name === 'Customers');
                      const hasOtherLedgers = state.routes.some((r) => r.name === 'OtherLedgers');
                      const children: DropdownItem[] = [];
                      if (hasCustomers) {
                        children.push({ key: 'Customers', label: 'Customers', onPress: () => navigateTo('Customers') });
                      }
                      if (hasOtherLedgers) {
                        children.push({ key: 'OtherLedgers', label: 'Other Ledgers', onPress: () => navigateTo('OtherLedgers') });
                      }
                      return {
                        key: 'LedgerMaster',
                        label: LABELS.LedgerMaster ?? 'Ledger Master',
                        // Parent label does nothing on click — submenu opens
                        // on hover (web) / tap-arrow (touch).
                        onPress: () => { /* no-op: expand only */ },
                        children,
                      };
                    }
                    if (n === 'ItemMaster') {
                      // Nested submenu: Items / Item Group / Item Category.
                      const hasItemMaster = state.routes.some((r) => r.name === 'ItemMaster');
                      const hasItemGroup = state.routes.some((r) => r.name === 'ItemGroup');
                      const hasItemCategory = state.routes.some((r) => r.name === 'ItemCategory');
                      const children: DropdownItem[] = [];
                      // Only expose "Items" if the ItemMaster tab is actually
                      // mounted (i.e. user has itemmaster.view). Otherwise
                      // jump straight to ItemGroup / ItemCategory siblings.
                      if (hasItemMaster) {
                        children.push({ key: 'ItemMaster', label: 'Items', onPress: () => navigateTo('ItemMaster') });
                      }
                      if (hasItemGroup) {
                        children.push({ key: 'ItemGroup', label: 'Item Group', onPress: () => navigateTo('ItemGroup') });
                      }
                      if (hasItemCategory) {
                        children.push({ key: 'ItemCategory', label: 'Item Category', onPress: () => navigateTo('ItemCategory') });
                      }
                      return {
                        key: 'ItemMaster',
                        label: LABELS.ItemMaster ?? 'Item Master',
                        // Parent label navigates to ItemMaster if the user
                        // owns it; otherwise it's a pure expand-only header.
                        onPress: hasItemMaster ? () => navigateTo('ItemMaster') : () => { /* no-op */ },
                        children,
                      };
                    }
                    return {
                      key: n,
                      label: LABELS[n] ?? n,
                      onPress: () => navigateTo(n),
                    };
                  })}
                />
              ) : null;
            }

            if (name === 'Billing') {
              if (!hasBilling) return null;
              // Build the Vouchers dropdown items based on what the user
              // can actually access. Add Voucher → voucher.create.
              // Daybook → daybook.view (separate permission slot).
              const billingItems: DropdownItem[] = [];
              if (canDoAction(user, 'voucher', 'create')) {
                billingItems.push({
                  key: 'VoucherForm',
                  label: 'Add Voucher',
                  onPress: () => navigateTo('Billing', { screen: 'VoucherForm' }),
                });
              }
              // Daybook is the natural list-view for vouchers, so anyone with
              // either daybook.view OR voucher.view gets a way in.
              if (canDoAction(user, 'daybook', 'view') || canDoAction(user, 'voucher', 'view')) {
                billingItems.push({
                  key: 'Daybook',
                  label: 'Daybook',
                  onPress: () => navigateTo('Billing', { screen: 'Daybook' }),
                });
              }
              if (billingItems.length === 0) return null;
              return (
                <DropdownNavItem
                  key="billing"
                  label="Vouchers"
                  active={billingActive}
                  activeKey={billingActive ? billingActiveScreen : ''}
                  isOpen={openDropdown === 'billing'}
                  onToggle={() => setOpenDropdown((v) => (v === 'billing' ? null : 'billing'))}
                  onClose={() => setOpenDropdown(null)}
                  items={billingItems}
                />
              );
            }

            const routeIndex = state.routes.findIndex((r) => r.name === name);
            if (routeIndex === -1) return null;
            // The Bilty tab is mounted for any user with voucher.view (so the
            // Daybook can navigate to BiltyForm). But it should only appear
            // in the top nav for users who actually own the Bilty page.
            if (name === 'Bilty' && !canDoAction(user, 'bilty', 'view')) return null;
            const route = state.routes[routeIndex];
            const isRouteActive = state.index === routeIndex;
            // Suppress the active glow / underline on this tab while any
            // dropdown menu is open — only the open dropdown should look
            // "active" at that moment, even though the underlying route
            // hasn't changed yet.
            const showActive = isRouteActive && openDropdown === null;
            return (
              <NavItem
                key={route.key}
                label={LABELS[route.name] ?? route.name}
                active={showActive}
                onPress={() => {
                  setOpenDropdown(null);
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isRouteActive && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
        </View>

        {/* ── Profile avatar ── */}
        <Pressable
          onPress={() => setProfileOpen(v => !v)}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      <ProfilePanel
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        logout={logout}
        onNavigate={(tab) => {
          setProfileOpen(false);
          navigation.navigate(tab as any);
        }}
      />
    </>
  );
}

type DropdownItem = {
  key: string;
  label: string;
  onPress: () => void;
  // When present, the item shows a chevron and opens a flyout submenu on
  // hover (web) or tap (touch). Used for nested "Item Master" entry.
  children?: DropdownItem[];
};

function DropdownNavItem({
  label,
  active,
  activeKey,
  isOpen,
  onToggle,
  onClose,
  items,
}: {
  label: string;
  active: boolean;
  activeKey: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: DropdownItem[];
}) {
  const [highlight, setHighlight] = useState(0);
  // Index of the currently-hovered parent item that has children (controls
  // the flyout panel). null = no flyout open.
  const [openChildIdx, setOpenChildIdx] = useState<number | null>(null);
  const [childHighlight, setChildHighlight] = useState(0);

  // Reset highlight whenever the menu opens.
  useEffect(() => {
    if (isOpen) {
      setHighlight(0);
      setOpenChildIdx(null);
      setChildHighlight(0);
    }
  }, [isOpen]);

  // Web keyboard navigation — same capture-phase pattern as AutocompleteField.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // If a child flyout is open, route keys to the child list.
      if (openChildIdx !== null) {
        const childItems = items[openChildIdx]?.children ?? [];
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setChildHighlight((i) => (i + 1) % childItems.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setChildHighlight((i) => (i - 1 + childItems.length) % childItems.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const it = childItems[childHighlight];
          if (it) it.onPress();
        } else if (e.key === 'Escape' || e.key === 'ArrowLeft') {
          e.preventDefault();
          setOpenChildIdx(null);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const it = items[highlight];
        if (it && it.children && it.children.length > 0) {
          setOpenChildIdx(highlight);
          setChildHighlight(0);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[highlight];
        if (it) {
          if (it.children && it.children.length > 0) {
            setOpenChildIdx(highlight);
            setChildHighlight(0);
          } else {
            it.onPress();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, items, highlight, openChildIdx, childHighlight, onClose]);

  return (
    <View style={styles.navItem}>
      <Pressable
        onPress={onToggle}
        // Apply the same red-tinted glow as regular tabs when the menu is
        // either on an active sub-route OR currently open.
        style={[styles.navItemInner, (active || isOpen) && styles.navItemInnerActive]}
        accessibilityRole="button"
      >
        <Text style={[styles.navLabel, (active || isOpen) && styles.navLabelActive]}>
          {label} <Text style={styles.caret}>{isOpen ? '▴' : '▾'}</Text>
        </Text>
        {(active || isOpen) && <View style={styles.activeBar} />}
      </Pressable>

      {isOpen ? (
        <>
          <Pressable style={styles.dropdownScrim} onPress={onClose} />
          <View style={styles.dropdownMenu}>
            {items.map((it, idx) => {
              const hasChildren = !!(it.children && it.children.length > 0);
              const childActive = hasChildren && it.children!.some((c) => c.key === activeKey);
              const isActive = it.key === activeKey || childActive;
              const isHighlight = idx === highlight;
              const flyoutOpen = hasChildren && openChildIdx === idx;
              return (
                <View key={it.key} style={hasChildren ? styles.dropdownItemWithChildren : undefined}>
                  <Pressable
                    onPress={() => {
                      if (hasChildren) {
                        // Tap toggles the flyout on touch; on web, hover already
                        // opens it, so a tap here jumps to the parent route.
                        if (Platform.OS === 'web') {
                          it.onPress();
                        } else {
                          setOpenChildIdx((cur) => (cur === idx ? null : idx));
                          setChildHighlight(0);
                        }
                      } else {
                        it.onPress();
                      }
                    }}
                    // Mouse hover keeps keyboard + cursor highlight in sync.
                    // For items with children, hover also opens the flyout.
                    {...(Platform.OS === 'web'
                      ? ({
                          onMouseEnter: () => {
                            setHighlight(idx);
                            if (hasChildren) {
                              setOpenChildIdx(idx);
                              setChildHighlight(0);
                            } else {
                              setOpenChildIdx(null);
                            }
                          },
                        } as any)
                      : {})}
                    style={({ pressed }) => [
                      styles.dropdownItem,
                      isActive && styles.dropdownItemActive,
                      (isHighlight || flyoutOpen) && styles.dropdownItemHover,
                      pressed && styles.dropdownItemPressed,
                      idx === items.length - 1 && styles.dropdownItemLast,
                    ]}
                    accessibilityRole="menuitem"
                  >
                    <View style={[styles.dropdownDot, isActive && styles.dropdownDotActive]} />
                    <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}>
                      {it.label}
                    </Text>
                    {hasChildren ? (
                      <Text style={styles.dropdownChevron}>›</Text>
                    ) : null}
                  </Pressable>

                  {flyoutOpen && hasChildren ? (
                    <View style={styles.flyoutMenu}>
                      {it.children!.map((c, cidx) => {
                        const cActive = c.key === activeKey;
                        const cHighlight = cidx === childHighlight;
                        return (
                          <Pressable
                            key={c.key}
                            onPress={c.onPress}
                            {...(Platform.OS === 'web'
                              ? ({ onMouseEnter: () => setChildHighlight(cidx) } as any)
                              : {})}
                            style={({ pressed }) => [
                              styles.dropdownItem,
                              cActive && styles.dropdownItemActive,
                              cHighlight && styles.dropdownItemHover,
                              pressed && styles.dropdownItemPressed,
                              cidx === it.children!.length - 1 && styles.dropdownItemLast,
                            ]}
                            accessibilityRole="menuitem"
                          >
                            <View style={[styles.dropdownDot, cActive && styles.dropdownDotActive]} />
                            <Text style={[styles.dropdownItemText, cActive && styles.dropdownItemTextActive]}>
                              {c.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

function NavItem({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [styles.navItem, Platform.OS === 'web' && (styles.navItemHoverWrap as any)]}
      accessibilityRole="link"
    >
      <Animated.View style={[
        styles.navItemInner,
        { transform: [{ scale: scaleAnim }] },
        active && styles.navItemInnerActive,
      ]}>
        <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
        {active && <View style={styles.activeBar} />}
      </Animated.View>
    </Pressable>
  );
}

// Flatten desktop NAV_ORDER into a stacked mobile drawer list.
// Mirrors the desktop dropdowns as expandable subgroups.
function buildDrawerItems(args: {
  availableLedgerTargets: string[];
  hasBilling: boolean;
  activeRouteName: string;
  billingActiveScreen: string;
  ledgerActive: boolean;
  billingActive: boolean;
  hasItemMaster: boolean;
  hasItemGroup: boolean;
  hasItemCategory: boolean;
  hasCustomers: boolean;
  hasOtherLedgers: boolean;
  hasUsers: boolean;
  // Whether to expose the corresponding link in the Vouchers drawer entry.
  canCreateVoucher: boolean;
  canViewDaybook: boolean;
  // Bilty drawer row only shows when the user actually owns the Bilty page.
  canViewBilty: boolean;
  navigateTo: (routeName: string, params?: object) => void;
}): DrawerNavItem[] {
  const out: DrawerNavItem[] = [];

  out.push({
    key: 'Dashboard',
    label: 'Dashboard',
    active: args.activeRouteName === 'Dashboard',
    onPress: () => args.navigateTo('Dashboard'),
  });

  if (args.availableLedgerTargets.length > 0) {
    const ledgerChildren: DrawerNavItem[] = [];
    args.availableLedgerTargets.forEach((n) => {
      if (n === 'LedgerMaster') {
        // Mobile drawer is a flat list — emit Customers / Other Ledgers as
        // sibling rows. The "Ledger Master" parent label itself is omitted
        // because clicking it on desktop is a no-op (just expands).
        if (args.hasCustomers) {
          ledgerChildren.push({
            key: 'Customers',
            label: LABELS.Customers ?? 'Customers',
            active: args.activeRouteName === 'Customers',
            onPress: () => args.navigateTo('Customers'),
          });
        }
        if (args.hasOtherLedgers) {
          ledgerChildren.push({
            key: 'OtherLedgers',
            label: LABELS.OtherLedgers ?? 'Other Ledgers',
            active: args.activeRouteName === 'OtherLedgers',
            onPress: () => args.navigateTo('OtherLedgers'),
          });
        }
      } else if (n === 'ItemMaster') {
        // Mobile drawer is flat — only emit "Items" if the parent tab is
        // mounted. ItemGroup / ItemCategory siblings are emitted unconditionally
        // (gated by their own perms).
        if (args.hasItemMaster) {
          ledgerChildren.push({
            key: 'ItemMaster',
            label: LABELS.ItemMaster ?? 'Item Master',
            active: args.activeRouteName === 'ItemMaster',
            onPress: () => args.navigateTo('ItemMaster'),
          });
        }
        if (args.hasItemGroup) {
          ledgerChildren.push({
            key: 'ItemGroup',
            label: 'Item Group',
            active: args.activeRouteName === 'ItemGroup',
            onPress: () => args.navigateTo('ItemGroup'),
          });
        }
        if (args.hasItemCategory) {
          ledgerChildren.push({
            key: 'ItemCategory',
            label: 'Item Category',
            active: args.activeRouteName === 'ItemCategory',
            onPress: () => args.navigateTo('ItemCategory'),
          });
        }
      } else {
        ledgerChildren.push({
          key: n,
          label: LABELS[n] ?? n,
          active: args.activeRouteName === n,
          onPress: () => args.navigateTo(n),
        });
      }
    });
    out.push({ key: 'Ledger', label: 'Ledger', active: args.ledgerActive, children: ledgerChildren });
  }

  if (args.canViewBilty) {
    out.push({
      key: 'Bilty',
      label: 'Bilty',
      active: args.activeRouteName === 'Bilty',
      onPress: () => args.navigateTo('Bilty'),
    });
  }
  out.push({
    key: 'Freight',
    label: 'Freight',
    active: args.activeRouteName === 'Freight',
    onPress: () => args.navigateTo('Freight'),
  });

  if (args.hasBilling) {
    const billingChildren: DrawerNavItem[] = [];
    if (args.canCreateVoucher) {
      billingChildren.push({
        key: 'VoucherForm',
        label: 'Add Voucher',
        active: args.billingActive && args.billingActiveScreen === 'VoucherForm',
        onPress: () => args.navigateTo('Billing', { screen: 'VoucherForm' }),
      });
    }
    if (args.canViewDaybook) {
      billingChildren.push({
        key: 'Daybook',
        label: 'Daybook',
        active: args.billingActive && args.billingActiveScreen === 'Daybook',
        onPress: () => args.navigateTo('Billing', { screen: 'Daybook' }),
      });
    }
    if (billingChildren.length > 0) {
      out.push({
        key: 'Billing',
        label: 'Vouchers',
        active: args.billingActive,
        children: billingChildren,
      });
    }
  }

  if (args.hasUsers) {
    out.push({
      key: 'Users',
      label: 'Users',
      active: args.activeRouteName === 'Users',
      onPress: () => args.navigateTo('Users'),
    });
  }

  return out;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TOP_NAV_HEIGHT,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 1000,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  // Logo
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 32,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoMarkText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  logoWordmark: {
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 15,
    letterSpacing: 3,
  },

  // Nav items
  navItems: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  navItem: {
    paddingHorizontal: 1,
  },
  navItemHoverWrap: Platform.OS === 'web' ? {
    // @ts-ignore web-only CSS
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  } as any : {},
  navItemInner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    position: 'relative',
    borderRadius: 8,
    // Suppress the browser's default black focus outline on the dropdown
    // toggle buttons (Ledger / Reports) — the active red underline already
    // serves as a visual focus indicator.
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', transition: 'background-color 0.2s ease, box-shadow 0.2s ease' } as any)
      : {}),
  },
  navItemInnerActive: Platform.OS === 'web' ? {
    backgroundColor: 'rgba(247,72,61,0.06)',
    // @ts-ignore web-only
    boxShadow: '0 0 12px rgba(247,72,61,0.12)',
  } as any : {},
  navLabel: {
    color: 'rgba(15,23,42,0.45)',
    fontFamily: typography.uiBold,
    fontSize: 14,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' ? { transition: 'color 0.2s ease' } as any : {}),
  },
  navLabelActive: {
    color: '#0F172A',
  },
  activeBar: {
    position: 'absolute',
    bottom: -4,
    left: 10,
    right: 10,
    height: 2.5,
    backgroundColor: colors.brandRed,
    borderRadius: 2,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 6px rgba(247,72,61,0.35)' } as any : {}),
  },
  caret: {
    fontSize: 10,
    color: 'rgba(15,23,42,0.55)',
  },

  // Dropdown
  dropdownScrim: {
    position: 'absolute',
    top: -TOP_NAV_HEIGHT,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 999,
  },
  dropdownMenu: {
    position: 'absolute',
    top: TOP_NAV_HEIGHT - 16,
    left: -4,
    minWidth: 210,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
    paddingVertical: 6,
    zIndex: 1001,
    elevation: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 4px 24px rgba(15,23,42,0.10), 0 0 0 1px rgba(226,232,240,0.3)',
    } as any : {}),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginHorizontal: 5,
    borderRadius: 7,
    gap: 9,
    ...(Platform.OS === 'web' ? { transition: 'background-color 0.15s ease' } as any : {}),
  },
  dropdownItemPressed: {
    backgroundColor: colors.brandRedTone,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(247,72,61,0.08)',
  },
  // Keyboard / mouse hover highlight — same light grey used in AutocompleteField.
  dropdownItemHover: {
    backgroundColor: '#EEF2F7',
  },
  dropdownItemLast: {
    marginBottom: 2,
  },
  dropdownDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.brandRed,
    opacity: 0.45,
  },
  dropdownDotActive: {
    opacity: 1,
    width: 6,
    height: 6,
  },
  dropdownItemText: {
    color: '#1E293B',
    fontFamily: typography.uiMedium,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  dropdownItemTextActive: {
    color: colors.brandRed,
    fontFamily: typography.uiBold,
  },
  // Wraps a parent dropdown row that has a flyout — relative so the absolute
  // flyout panel anchors to its right edge.
  dropdownItemWithChildren: {
    position: 'relative',
  },
  dropdownChevron: {
    marginLeft: 'auto',
    color: 'rgba(15,23,42,0.55)',
    fontSize: 14,
    fontFamily: typography.uiBold,
  },
  // Side flyout panel that opens to the right of the parent dropdown row.
  // Reuses the same visual tokens as `dropdownMenu` for consistency.
  flyoutMenu: {
    position: 'absolute',
    top: 0,
    left: '100%',
    minWidth: 200,
    marginLeft: 4,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
    paddingVertical: 6,
    zIndex: 1002,
    elevation: 26,
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 4px 24px rgba(15,23,42,0.10), 0 0 0 1px rgba(226,232,240,0.3)',
    } as any : {}),
  },

  // Avatar
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(247,72,61,0.25)',
    marginLeft: 16,
  },
  avatarPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // ── Mobile (<768px) ──
  barMobile: {
    height: TOP_NAV_HEIGHT_MOBILE,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  hamburger: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#0F172A',
  },
  logoWrapMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginRight: 0,
  },
  logoWordmarkMobile: {
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 13,
    letterSpacing: 2.5,
  },
  avatarMobile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 0,
  },
});
