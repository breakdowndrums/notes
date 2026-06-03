import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  clampLibraryDayStartHour,
  DefaultLibraryDayStartHour,
  LibraryDayStartHourStorageKey,
} from '@/constants/preferences';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';

export default function AccountScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [libraryDayStartDraft, setLibraryDayStartDraft] = useState(String(DefaultLibraryDayStartHour));
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isAuthReady, user } = useAuth();
  const theme = useTheme();
  const contentWidth = Math.min(Math.max(0, width - Spacing.two * 2), MaxContentWidth);

  useEffect(() => {
    AsyncStorage.getItem(LibraryDayStartHourStorageKey).then((storedHour) => {
      if (storedHour === null) {
        return;
      }

      setLibraryDayStartDraft(String(clampLibraryDayStartHour(Number(storedHour))));
    });
  }, []);

  function getEmailRedirectTo() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.location.origin;
    }

    return 'notes://';
  }

  function validateCredentials() {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter an email address.');
      return false;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase is not configured', 'Add your EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY values first.');
      return false;
    }

    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return false;
    }

    return true;
  }

  async function signInWithPassword() {
    if (!validateCredentials()) {
      return;
    }

    setAuthMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setAuthMessage(error.message);
      Alert.alert('Sign-in failed', error.message);
      return;
    }

    setAuthMessage('Signed in.');
  }

  async function signUpWithPassword() {
    if (!validateCredentials()) {
      return;
    }

    setAuthMessage(null);
    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getEmailRedirectTo(),
      },
    });
    setIsSubmitting(false);

    if (error) {
      setAuthMessage(error.message);
      Alert.alert('Sign-up failed', error.message);
      return;
    }

    if (data.session) {
      setAuthMessage('Account created. You are signed in.');
      Alert.alert('Account created', 'You are signed in.');
      return;
    }

    setAuthMessage('Check your email to confirm the account, then sign in.');
    Alert.alert('Check your email', 'Confirm your email address, then sign in.');
  }

  async function resendConfirmationEmail() {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter the email address you used to create the account.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase is not configured', 'Add your EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY values first.');
      return;
    }

    setAuthMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: getEmailRedirectTo(),
      },
    });
    setIsSubmitting(false);

    if (error) {
      setAuthMessage(error.message);
      Alert.alert('Could not resend email', error.message);
      return;
    }

    setAuthMessage('Confirmation email sent. Open it, then come back and sign in.');
  }

  async function sendPasswordResetEmail() {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter the email address for your account.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase is not configured', 'Add your EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY values first.');
      return;
    }

    setAuthMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getEmailRedirectTo(),
    });
    setIsSubmitting(false);

    if (error) {
      setAuthMessage(error.message);
      Alert.alert('Could not send reset email', error.message);
      return;
    }

    setAuthMessage('Password reset email sent. Open it, then set a new password here.');
  }

  async function updatePassword() {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase is not configured', 'Add your EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY values first.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }

    setAuthMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setAuthMessage(error.message);
      Alert.alert('Could not update password', error.message);
      return;
    }

    setPassword('');
    setAuthMessage('Password updated. You can keep using the app.');
  }

  async function saveLibraryDayStartHour() {
    const nextHour = clampLibraryDayStartHour(Number(libraryDayStartDraft));
    const nextDraft = String(nextHour);

    setLibraryDayStartDraft(nextDraft);
    await AsyncStorage.setItem(LibraryDayStartHourStorageKey, nextDraft);
    setAuthMessage(`Library day now starts at ${nextDraft.padStart(2, '0')}:00.`);
  }

  async function signOut() {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      Alert.alert('Sign-out failed', error.message);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.content, { width: contentWidth, paddingBottom: insets.bottom + Spacing.four }]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <ThemedText type="subtitle">Account</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to notes"
                onPress={() => router.replace('/')}
                style={({ pressed }) => [styles.backButton, { borderColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                <ThemedText type="smallBold">Notes</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {isSupabaseConfigured ? 'Supabase auth is wired for this app.' : 'Add Supabase env keys to enable auth and sync.'}
            </ThemedText>
          </View>

          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Session</ThemedText>
            <View style={[styles.statusPill, { backgroundColor: theme.background }]}>
              <View style={[styles.statusDot, { backgroundColor: user ? '#2f6f73' : '#d18b37' }]} />
              <ThemedText type="small" themeColor="textSecondary">
                {!isAuthReady ? 'Checking session...' : user ? user.email ?? 'Signed in' : 'Signed out'}
              </ThemedText>
            </View>
            {user ? (
              <>
                <ThemedText type="smallBold">Set new password</ThemedText>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="yes"
                  secureTextEntry
                  placeholder="New password"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.backgroundSelected,
                      color: theme.text,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
                <Pressable
                  onPress={updatePassword}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.button, (pressed || isSubmitting) && styles.pressed]}>
                  <ThemedText type="smallBold" style={styles.buttonText}>
                    {isSubmitting ? 'Working...' : 'Update password'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={signOut}
                  disabled={isSigningOut}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.backgroundSelected }, (pressed || isSigningOut) && styles.pressed]}>
                  <ThemedText type="smallBold">{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText>
                </Pressable>
                {authMessage ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.authMessage}>
                    {authMessage}
                  </ThemedText>
                ) : null}
              </>
            ) : (
              <>
                <ThemedText type="smallBold">Email and password</ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.backgroundSelected,
                      color: theme.text,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  importantForAutofill="yes"
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.backgroundSelected,
                      color: theme.text,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
                <Pressable
                  onPress={signInWithPassword}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.button, (pressed || isSubmitting) && styles.pressed]}>
                  <ThemedText type="smallBold" style={styles.buttonText}>
                    {isSubmitting ? 'Working...' : 'Sign in'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={signUpWithPassword}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.backgroundSelected }, (pressed || isSubmitting) && styles.pressed]}>
                  <ThemedText type="smallBold">Create account</ThemedText>
                </Pressable>
                <Pressable
                  onPress={resendConfirmationEmail}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.backgroundSelected }, (pressed || isSubmitting) && styles.pressed]}>
                  <ThemedText type="smallBold">Resend confirmation</ThemedText>
                </Pressable>
                <Pressable
                  onPress={sendPasswordResetEmail}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.backgroundSelected }, (pressed || isSubmitting) && styles.pressed]}>
                  <ThemedText type="smallBold">Reset password</ThemedText>
                </Pressable>
                {authMessage ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.authMessage}>
                    {authMessage}
                  </ThemedText>
                ) : null}
              </>
            )}
          </View>

          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Preferences</ThemedText>
            <View style={[styles.preferenceRow, { backgroundColor: theme.background }]}>
              <View style={styles.preferenceCopy}>
                <ThemedText type="smallBold">Library day starts</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Notes before this time still count as yesterday.
                </ThemedText>
              </View>
              <View style={styles.preferenceInputWrap}>
                <TextInput
                  value={libraryDayStartDraft}
                  onChangeText={(value) => setLibraryDayStartDraft(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  onBlur={saveLibraryDayStartHour}
                  onSubmitEditing={saveLibraryDayStartHour}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  placeholder="5"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.preferenceInput,
                    {
                      borderColor: theme.backgroundSelected,
                      color: theme.text,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                />
                <ThemedText type="smallBold">:00</ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Use 0-23. Changes apply when you return to Library.
            </ThemedText>
          </View>

          <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Backend checklist</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Run the SQL, add env keys, sign in, then tap + on the Board tab to create your synced board.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Supabase configured: {isSupabaseConfigured ? 'yes' : 'no'}
            </ThemedText>
            <ThemedText type="code">supabase/schema.sql</ThemedText>
          </View>

          <View style={[styles.panel, styles.developerNote, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Development note</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Synced account ready. Note persistence comes next.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    alignSelf: 'center',
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  backButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.two,
    gap: Spacing.three,
  },
  developerNote: {
    gap: Spacing.one,
  },
  statusPill: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  preferenceRow: {
    minHeight: 64,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  preferenceInputWrap: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  preferenceInput: {
    width: 48,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  preferenceCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#243b37',
  },
  buttonText: {
    color: Colors.light.background,
  },
  secondaryButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authMessage: {
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.72,
  },
});
