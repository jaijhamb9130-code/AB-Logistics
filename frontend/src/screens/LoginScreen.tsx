/**
 * LoginScreen — glassmorphism entry point (AUTH-01, AUTH-02, AUTH-03, AUTH-04).
 *
 * Composition:
 *   LinearGradient background → centered GlassCard → InputField + PasswordField + ButtonPrimary.
 *
 * Behaviour:
 *   - Inline validation (validateLogin) blocks submission when fields are empty (AUTH-02).
 *   - PasswordField owns the mask/unmask toggle (AUTH-03).
 *   - ButtonPrimary shows a spinner and is disabled while the login is in flight (AUTH-04).
 *   - On 401 / invalid_credentials, a single generic banner "Invalid username or password"
 *     is shown and per-field errors are cleared (T-01-23 — no user enumeration leak).
 *   - Success: NO navigation.navigate() call. AuthContext flips isAuthenticated →
 *     AppNavigator swaps from AuthNavigator to AppTabs automatically (D-19, AUTH-07).
 *
 * Colors: all sourced from constants/theme.ts (brand palette — red/yellow tones + black).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GlassCard,
  InputField,
  PasswordField,
  ButtonPrimary,
} from '../components';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography, radius, text } from '../constants/theme';
import { validateLogin, LoginErrors } from '../utils/validation';

export function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setServerError(null);
    const nextErrors = validateLogin({ username, password });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      // AuthContext flips isAuthenticated → AppNavigator swaps to AppTabs.
      // No navigate() call here (D-19 invariant).
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.error;
      if (status === 401 || code === 'invalid_credentials') {
        setServerError('Invalid username or password');
      } else if (code === 'account_disabled') {
        setServerError(
          'This account has been disabled. Contact an administrator.'
        );
      } else {
        setServerError(
          'Unable to sign in. Check your connection and try again.'
        );
      }
      // Server error supersedes stale field errors from a previous attempt.
      setErrors({});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F5F7FA', '#FFFFFF']}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.bg}
    >
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.logoWrap}>
          <Image
            source={require('../../assets/abs-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="ABS logo"
          />
        </View>
        <GlassCard style={styles.card}>
          <Text style={styles.title}>AB Logistics</Text>
          <View style={styles.accentUnderline} />
          <Text style={styles.subtitle}>Sign in to continue</Text>

          {serverError ? (
            <Text style={styles.serverError} accessibilityLiveRegion="polite">
              {serverError}
            </Text>
          ) : null}

          <InputField
            label="Username"
            value={username}
            onChangeText={setUsername}
            error={errors.username}
            autoCapitalize="none"
            autoCorrect={false}
            testID="login-username"
          />
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            testID="login-password"
          />

          <View style={styles.spacer} />
          <ButtonPrimary
            title="Sign in"
            onPress={handleSubmit}
            loading={submitting || isLoading}
            testID="login-submit"
          />
        </GlassCard>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const CARD_MAX_WIDTH = 420;

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    width: '100%',
    maxWidth: CARD_MAX_WIDTH,
  },
  logo: {
    width: 180,
    height: 96,
  },
  card: {
    width: '100%',
    maxWidth: CARD_MAX_WIDTH,
  },
  title: {
    ...text.heading,
    fontSize: 26,
    lineHeight: 32,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  accentUnderline: {
    alignSelf: 'center',
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brandYellow,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...text.value,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  serverError: {
    backgroundColor: colors.brandRedTone,
    borderWidth: 1,
    borderColor: colors.brandRedBorder,
    color: colors.danger,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    fontFamily: typography.uiMedium,
    fontWeight: '500',
    fontSize: 13,
    textAlign: 'center',
  },
  spacer: {
    height: spacing.md,
  },
});

export default LoginScreen;
