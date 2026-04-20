import React, { useRef, useState } from 'react';
import {
  Animated,
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
  Orders: 'Orders',
  Vehicles: 'Vehicles',
  Customers: 'Customers',
  Reports: 'Reports',
  Users: 'Users',
};

// Routes grouped under the "Ledger" dropdown — hidden as top-level nav items.
const LEDGER_ROUTES = ['Vehicles', 'Customers'];
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

        {/* ── Nav items ── */}
        <View style={styles.navItems}>
          {state.routes.map((route, index) => {
            if (HIDDEN_FROM_NAV.includes(route.name)) return null;
            const active = state.index === index;
            const label = LABELS[route.name] ?? route.name;
            return (
              <NavItem
                key={route.key}
                label={label}
                active={active}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!active && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}

          {/* Ledger dropdown — only if user has access to at least one ledger page */}
          {availableLedgerTargets.length > 0 ? (
            <DropdownNavItem
              label="Ledger"
              active={ledgerActive}
              isOpen={openDropdown === 'ledger'}
              onToggle={() => setOpenDropdown((v) => (v === 'ledger' ? null : 'ledger'))}
              onClose={() => setOpenDropdown(null)}
              items={availableLedgerTargets.map((name) => ({
                key: name,
                label: LABELS[name] ?? name,
                onPress: () => navigateTo(name),
              }))}
            />
          ) : null}

          {/* Reports dropdown → routes to Reports tab with section param */}
          {hasReports ? (
            <DropdownNavItem
              label="Reports"
              active={reportsActive}
              isOpen={openDropdown === 'reports'}
              onToggle={() => setOpenDropdown((v) => (v === 'reports' ? null : 'reports'))}
              onClose={() => setOpenDropdown(null)}
              items={[
                {
                  key: 'bilty',
                  label: 'Bilty History',
                  onPress: () => navigateTo('Reports', { section: 'bilty' }),
                },
                {
                  key: 'order',
                  label: 'Order History',
                  onPress: () => navigateTo('Reports', { section: 'order' }),
                },
              ]}
            />
          ) : null}
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
  isOpen,
  onToggle,
  onClose,
  items,
}: {
  label: string;
  active: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: DropdownItem[];
}) {
  return (
    <View style={styles.navItem}>
      <Pressable onPress={onToggle} style={styles.navItemInner} accessibilityRole="button">
        <Text style={[styles.navLabel, active && styles.navLabelActive]}>
          {label} <Text style={styles.caret}>{isOpen ? '▴' : '▾'}</Text>
        </Text>
        {active && <View style={styles.activeBar} />}
      </Pressable>

      {isOpen ? (
        <>
          {/* Click-outside scrim — closes the menu when tapping elsewhere */}
          <Pressable style={styles.dropdownScrim} onPress={onClose} />
          <View style={styles.dropdownMenu}>
            {items.map((it) => (
              <Pressable
                key={it.key}
                onPress={it.onPress}
                style={({ pressed }) => [
                  styles.dropdownItem,
                  pressed && styles.dropdownItemPressed,
                ]}
                accessibilityRole="menuitem"
              >
                <Text style={styles.dropdownItemText}>{it.label}</Text>
              </Pressable>
            ))}
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
      style={styles.navItem}
      accessibilityRole="link"
    >
      <Animated.View style={[styles.navItemInner, { transform: [{ scale: scaleAnim }] }]}>
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
    paddingHorizontal: 2,
  },
  navItemInner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    position: 'relative',
  },
  navLabel: {
    color: 'rgba(15,23,42,0.45)',
    fontFamily: typography.uiBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  navLabelActive: {
    color: '#0F172A',
  },
  activeBar: {
    position: 'absolute',
    bottom: -4,
    left: 14,
    right: 14,
    height: 2,
    backgroundColor: colors.brandRed,
    borderRadius: 2,
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
    top: TOP_NAV_HEIGHT - 10,
    left: 0,
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    zIndex: 1001,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dropdownItemPressed: {
    backgroundColor: '#F5F7FA',
  },
  dropdownItemText: {
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 14,
    letterSpacing: 0.2,
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
