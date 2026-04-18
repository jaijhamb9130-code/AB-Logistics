import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

interface ShimmerSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function ShimmerSkeleton({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}: ShimmerSkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.shimmer,
        { width: width as ViewStyle['width'], height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

/** Pre-built layout for a bilty list row skeleton */
export function BiltyRowSkeleton() {
  return (
    <View style={styles.row}>
      <ShimmerSkeleton width="40%" height={14} style={styles.mb4} />
      <ShimmerSkeleton width="60%" height={12} />
    </View>
  );
}

/** Pre-built layout for a full-screen detail skeleton */
export function DetailSkeleton() {
  return (
    <View style={styles.detail}>
      <ShimmerSkeleton width="50%" height={20} style={styles.mb12} />
      {[1, 2, 3, 4].map((i) => (
        <ShimmerSkeleton key={i} width="100%" height={14} style={styles.mb8} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shimmer: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detail: {
    padding: 20,
  },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
});
