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
import { ProfilePanel } from './ProfilePanel';
import { colors, typography } from '../constants/theme';

export const TOP_NAV_HEIGHT = 66;

const LABELS: Record<string, string> = {
  Dashboard: 'Dashboard',
  Bilty: 'Bilty',
  Freight: 'Freight',
  Billing: 'Billing',
  PartyMaster: 'Party Master',
  OwnerMaster: 'Owner Master',
  AgentMaster: 'Agent Master',
  ItemMaster: 'Item Master',
  VehicleMaster: 'Vehicle Master',
  DestinationMaster: 'Destination Master',
  Reports: 'Reports',
  LedgerGroups: 'Ledger Groups',
  Users: 'Users',
};

// Explicit left-to-right display order of nav items.
// LedgerGroups sits second-last (just before Users).
const NAV_ORDER = ['Dashboard', 'Ledger', 'Bilty', 'Freight', 'Billing', 'Reports', 'LedgerGroups', 'Users'];

// Routes grouped under the "Ledger" dropdown — hidden as top-level nav items.
// Order here = order shown inside the dropdown (matches the user's requested sequence).
const LEDGER_ROUTES = [
  'PartyMaster',
  'OwnerMaster',
  'AgentMaster',
  'ItemMaster',
  'VehicleMaster',
  'DestinationMaster',
];
// Routes shown as dropdown instead of top-level (just Reports for now).
const REPORTS_ROUTES = ['Reports'];
const HIDDEN_FROM_NAV = [...LEDGER_ROUTES, ...REPORTS_ROUTES];

export function TopNavBar({ state, navigation }: BottomTabBarProps) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<null | 'ledger' | 'reports'>(null);

  const initials = (user?.username ?? 'AD').slice(0, 2).toUpperCase();

  const activeRouteName = state.routes[state.index]?.name ?? '';
  const ledgerActive = LEDGER_ROUTES.includes(activeRouteName);
  const reportsActive = REPORTS_ROUTES.includes(activeRouteName);

  // Which ledger/reports targets exist in the navigator (permission-gated by AppTabs).
  const availableLedgerTargets = state.routes
    .filter((r) => LEDGER_ROUTES.includes(r.name))
    .map((r) => r.name);
  const hasReports = state.routes.some((r) => r.name === 'Reports');

  const navigateTo = (routeName: string, params?: object) => {
    const target = state.routes.find((r) => r.name === routeName);
    if (!target) return;
    // Always navigate (even if tab is already active) so params reach the screen.
    navigation.navigate(routeName as never, params as never);
    setOpenDropdown(null);
  };

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
                  items={availableLedgerTargets.map((n) => ({
                    key: n,
                    label: LABELS[n] ?? n,
                    onPress: () => navigateTo(n),
                  }))}
                />
              ) : null;
            }

            if (name === 'Reports') {
              const reportsRoute = state.routes.find((r) => r.name === 'Reports');
              const reportsSection = (reportsRoute?.params as any)?.section ?? 'bilty';
              return hasReports ? (
                <DropdownNavItem
                  key="reports"
                  label="Reports"
                  active={reportsActive}
                  activeKey={reportsActive ? reportsSection : ''}
                  isOpen={openDropdown === 'reports'}
                  onToggle={() => setOpenDropdown((v) => (v === 'reports' ? null : 'reports'))}
                  onClose={() => setOpenDropdown(null)}
                  items={[
                    {
                      key: 'bilty',
                      label: 'Bilty History',
                      onPress: () => navigateTo('Reports', { section: 'bilty' }),
                    },
                  ]}
                />
              ) : null;
            }

            const routeIndex = state.routes.findIndex((r) => r.name === name);
            if (routeIndex === -1) return null;
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

type DropdownItem = { key: string; label: string; onPress: () => void };

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

  // Reset highlight whenever the menu opens.
  useEffect(() => {
    if (isOpen) setHighlight(0);
  }, [isOpen]);

  // Web keyboard navigation — same capture-phase pattern as AutocompleteField.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[highlight];
        if (it) it.onPress();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, items, highlight, onClose]);

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
              const isActive = it.key === activeKey;
              const isHighlight = idx === highlight;
              return (
                <Pressable
                  key={it.key}
                  onPress={it.onPress}
                  // Mouse hover keeps keyboard + cursor highlight in sync.
                  {...(Platform.OS === 'web'
                    ? ({ onMouseEnter: () => setHighlight(idx) } as any)
                    : {})}
                  style={({ pressed }) => [
                    styles.dropdownItem,
                    isActive && styles.dropdownItemActive,
                    isHighlight && styles.dropdownItemHover,
                    pressed && styles.dropdownItemPressed,
                    idx === items.length - 1 && styles.dropdownItemLast,
                  ]}
                  accessibilityRole="menuitem"
                >
                  <View style={[styles.dropdownDot, isActive && styles.dropdownDotActive]} />
                  <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}>
                    {it.label}
                  </Text>
                </Pressable>
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
      ? ({ outline: 'none', transition: 'background-color 0.2s ease, box-shadow 0.2s ease' } as any)
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
});
