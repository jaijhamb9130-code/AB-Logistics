/**
 * Fullscreen loading indicator — shown by AppNavigator during auth bootstrap.
 */

import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

export function Loader() {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
