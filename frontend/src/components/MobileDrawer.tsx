/**
 * MobileDrawer — left slide-in navigation panel for mobile web (<768px).
 *
 * Shown when the hamburger button on the mobile TopNavBar is tapped.
 * Reuses the same route metadata as the desktop nav, but renders nav
 * entries as a vertical stacked list with collapsible sections for
 * Ledger / Vouchers / Reports / Item Master.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, typography } from '../constants/theme';

export type DrawerNavItem = {
  key: string;
  label: string;
  onPress?: () => void;
  active?: boolean;
  children?: DrawerNavItem[];
};

interface Props {
  visible: boolean;
  onClose: () => void;
  user: { username: string; role: string } | null;
  items: DrawerNavItem[];
  onLogout: () => void;
}

export function MobileDrawer({ visible, onClose, user, items, onLogout }: Props) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(320, Math.max(260, width * 0.85));
  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 14,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -drawerWidth,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, drawerWidth, slideAnim, overlayAnim]);

  if (!mounted) return null;

  const initials = (user?.username ?? 'AD').slice(0, 2).toUpperCase();
  const roleLabel = user?.role === 'admin' ? 'Administrator' : 'Staff';

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Animated.View
        style={[styles.overlay, { opacity: overlayAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { width: drawerWidth, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>AB</Text>
          </View>
          <Text style={styles.logoWordmark}>LOGISTICS</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          >
            <Text style={styles.closeBtnText}>×</Text>
          </Pressable>
        </View>

        {/* User identity */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.username} numberOfLines={1}>
              {user?.username ?? 'User'}
            </Text>
            <Text style={styles.roleLabel}>{roleLabel}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Nav list */}
        <ScrollView contentContainerStyle={styles.navList} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const hasChildren = !!(item.children && item.children.length > 0);
            const isExpanded = !!expanded[item.key];
            const childActive =
              hasChildren && item.children!.some((c) => c.active);
            const showActive = item.active || childActive;
            return (
              <View key={item.key}>
                <Pressable
                  onPress={() => {
                    if (hasChildren) {
                      setExpanded((s) => ({ ...s, [item.key]: !s[item.key] }));
                    } else if (item.onPress) {
                      item.onPress();
                    }
                  }}
                  style={({ pressed }) => [
                    styles.navRow,
                    showActive && styles.navRowActive,
                    pressed && styles.navRowPressed,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={[styles.navDot, showActive && styles.navDotActive]} />
                  <Text style={[styles.navLabel, showActive && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                  {hasChildren ? (
                    <Text style={styles.navChevron}>{isExpanded ? '▴' : '▾'}</Text>
                  ) : null}
                </Pressable>

                {hasChildren && isExpanded ? (
                  <View style={styles.subList}>
                    {item.children!.map((c) => (
                      <Pressable
                        key={c.key}
                        onPress={c.onPress}
                        style={({ pressed }) => [
                          styles.subRow,
                          c.active && styles.subRowActive,
                          pressed && styles.navRowPressed,
                        ]}
                        accessibilityRole="button"
                      >
                        <View style={[styles.navDot, c.active && styles.navDotActive]} />
                        <Text
                          style={[styles.subLabel, c.active && styles.navLabelActive]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        {/* Logout */}
        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.logoutText}>LOGOUT</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 6, height: 0 },
    elevation: 30,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoMarkText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  logoWordmark: {
    flex: 1,
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 14,
    letterSpacing: 2.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#64748B',
    fontSize: 22,
    lineHeight: 22,
    fontFamily: typography.ui,
  },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  username: {
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 15,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  roleLabel: {
    color: '#64748B',
    fontFamily: typography.uiMedium,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 18,
  },

  navList: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 12,
    marginBottom: 2,
  },
  navRowActive: {
    backgroundColor: 'rgba(247,72,61,0.08)',
  },
  navRowPressed: {
    backgroundColor: '#EEF2F7',
  },
  navDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandRed,
    opacity: 0.4,
  },
  navDotActive: {
    opacity: 1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  navLabel: {
    flex: 1,
    color: '#1E293B',
    fontFamily: typography.uiMedium,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: colors.brandRed,
    fontFamily: typography.uiBold,
  },
  navChevron: {
    color: '#64748B',
    fontSize: 12,
  },
  subList: {
    marginLeft: 24,
    marginBottom: 4,
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    paddingLeft: 8,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 10,
    marginBottom: 2,
  },
  subRowActive: {
    backgroundColor: 'rgba(247,72,61,0.08)',
  },
  subLabel: {
    flex: 1,
    color: '#1E293B',
    fontFamily: typography.uiMedium,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  logoutBtn: {
    backgroundColor: colors.brandRed,
    marginHorizontal: 18,
    marginBottom: 18,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 13,
    letterSpacing: 2,
  },
});
