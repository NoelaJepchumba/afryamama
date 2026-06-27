import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';

interface LoginScreenProps {
  onLoginSuccess: (email: string, password: string) => Promise<void>;
  onSignUpSuccess: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<void>;
}

export default function LoginScreen({
  onLoginSuccess,
  onSignUpSuccess,
}: LoginScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAuthErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message.trim()) {
      const firebaseCode = (err as { code?: string }).code;

      if (firebaseCode === 'auth/email-already-in-use') {
        return 'This email is already in use. Please log in instead.';
      }

      if (firebaseCode === 'auth/invalid-email') {
        return 'Please enter a valid email address.';
      }

      if (firebaseCode === 'auth/weak-password') {
        return 'Password is too weak. Use at least 6 characters.';
      }

      if (firebaseCode === 'auth/network-request-failed') {
        return 'Network error. Check your internet and try again.';
      }

      return err.message;
    }

    return fallback;
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      await onLoginSuccess(email, password);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Login failed. Check credentials and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }

    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirm password do not match.');
      return;
    }

    setSignupLoading(true);
    setError(null);
    setInfo(null);

    try {
      await onSignUpSuccess(fullName, email, password);

      setInfo('Account created successfully.');

      setFullName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');

      setIsSignUp(false);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Account creation failed. Please try again.'));
    } finally {
      setSignupLoading(false);
    }
  };

  const handleCreateNewPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }

    if (password.trim().length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirm password do not match.');
      return;
    }

    setResetLoading(true);
    setError(null);
    setInfo(null);

    try {
      setInfo('Password updated. Please sign in with your new password.');
      setIsResetMode(false);
      setIsSignUp(false);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Failed to update password.'));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        style={styles.fullWidth}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>MOTHER CARE</Text>
          <Text style={styles.heroTitle}>Safe motherhood starts here</Text>
          <Text style={styles.heroText}>
            Track appointments, records, wellness tips and your pregnancy journey in one secure place.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, !isSignUp ? styles.modeTabActive : null]}
              onPress={() => {
                setError(null);
                setInfo(null);
                setIsSignUp(false);
                setIsResetMode(false);
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
            >
              <Text style={[styles.modeTabText, !isSignUp ? styles.modeTabTextActive : null]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, isSignUp ? styles.modeTabActive : null]}
              onPress={() => {
                setError(null);
                setInfo(null);
                setIsSignUp(true);
                setIsResetMode(false);
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
            >
              <Text style={[styles.modeTabText, isSignUp ? styles.modeTabTextActive : null]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{isResetMode ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back, mama'}</Text>

          <Text style={styles.subtitle}>
            {isResetMode
              ? 'Create a new password and confirm it, then sign in.'
              : isSignUp
              ? 'Create your account then set up your profile.'
              : 'Log in with your email and password.'}
          </Text>

          <View style={styles.form}>
          {isSignUp && !isResetMode ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
              />
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="Enter your email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{isResetMode ? 'New Password' : 'Password'}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Enter your password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((current) => !current)}
              >
                <Text style={styles.eyeButtonText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isSignUp || isResetMode ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  placeholder="Confirm your password"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword((current) => !current)}
                >
                  <Text style={styles.eyeButtonText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

            {isResetMode ? (
            <>
              <TouchableOpacity
                style={styles.button}
                onPress={handleCreateNewPassword}
              >
                <Text style={styles.buttonText}>
                  {resetLoading ? 'Updating password...' : 'Create New Password'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  setError(null);
                  setInfo(null);
                  setIsResetMode(false);
                  setIsSignUp(false);
                  setPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.switchButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : !isSignUp ? (
            <>
              <TouchableOpacity
                style={styles.button}
                onPress={handleLogin}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Signing In...' : 'Log In'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => {
                  setError(null);
                  setInfo(null);
                  setIsResetMode(true);
                  setIsSignUp(false);
                  setPassword('');
                  setConfirmPassword('');
                  setShowPassword(false);
                  setShowConfirmPassword(false);
                }}
              >
                <Text style={styles.linkButtonText}>
                  {resetLoading
                    ? 'Opening reset...'
                    : 'Forgot Password?'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.button}
                onPress={handleSignUp}
              >
                <Text style={styles.buttonText}>
                  {signupLoading
                    ? 'Creating Account...'
                    : 'Create Account'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  setError(null);
                  setInfo(null);
                  setIsSignUp(false);
                  setShowPassword(false);
                  setShowConfirmPassword(false);
                }}
              >
                <Text style={styles.switchButtonText}>
                  Already have an account? Log In
                </Text>
              </TouchableOpacity>
            </>
          )}

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {info ? (
            <Text style={styles.infoText}>{info}</Text>
          ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef0ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  heroCard: {
    width: Platform.OS === 'web' && width > 480 ? 420 : '100%',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#faf5ff',
  },
  heroTag: {
    alignSelf: 'flex-start',
    color: '#6d28d9',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    backgroundColor: '#ede9fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroTitle: {
    marginTop: 12,
    fontSize: 24,
    color: '#1f2937',
    fontWeight: '800',
  },
  heroText: {
    marginTop: 8,
    color: '#475569',
    lineHeight: 21,
  },
  card: {
    width: Platform.OS === 'web' && width > 480 ? 420 : '100%',
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dbe1ff',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeTabActive: {
    backgroundColor: '#ffffff',
  },
  modeTabText: {
    color: '#64748b',
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: '#111827',
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    color: '#64748b',
    marginTop: 6,
    marginBottom: 18,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
    fontWeight: '600',
    color: '#475569',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 13,
    backgroundColor: '#f9fafb',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  passwordInput: {
    flex: 1,
    padding: 13,
  },
  eyeButton: {
    borderLeftWidth: 1,
    borderLeftColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eyeButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#6d28d9',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#4338ca',
    fontWeight: '700',
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 14,
  },
  infoText: {
    color: '#0f766e',
    textAlign: 'center',
    marginTop: 14,
  },
});
