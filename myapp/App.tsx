import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { login, register, setAuthToken, User } from './src/api';

type AuthMode = 'login' | 'register';

const STORAGE_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
};

export default function App() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [authError, setAuthError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [tokenValue, userValue] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.token),
          AsyncStorage.getItem(STORAGE_KEYS.user),
        ]);

        if (tokenValue && userValue) {
          const parsedUser = JSON.parse(userValue) as User;
          setAuthToken(tokenValue);
          setAuthenticatedUser(parsedUser);
        }
      } catch {
        setAuthToken(null);
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEYS.token),
          AsyncStorage.removeItem(STORAGE_KEYS.user),
        ]);
      } finally {
        setRestoringSession(false);
      }
    };

    void restoreSession();
  }, []);

  const primaryButtonLabel = useMemo(
    () => (mode === 'login' ? 'Sign In' : 'Register'),
    [mode]
  );

  const secondaryButtonLabel = useMemo(
    () => (mode === 'login' ? 'Switch to Register' : 'Switch to Sign In'),
    [mode]
  );

  const onSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!normalizedEmail || !trimmedPassword) {
      setAuthError('Email and password are required.');
      setStatusMessage('');
      return;
    }

    try {
      setLoading(true);
      setAuthError('');

      if (mode === 'login') {
        const response = await login({ email: normalizedEmail, password: trimmedPassword });
        setAuthToken(response.token);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.token, response.token),
          AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(response.user)),
        ]);
        setAuthenticatedUser(response.user);
        setPassword('');
        setStatusMessage('');
        return;
      }

      const response = await register({ email: normalizedEmail, password: trimmedPassword });
      setStatusMessage(`Account created for ${response.user.email}. You can now sign in.`);
      setPassword('');
      setMode('login');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : mode === 'login'
              ? 'Invalid credentials. Please try again.'
              : 'Registration failed. Please try a different email.';

        setAuthError(message);
        setStatusMessage('');
      } else {
        setAuthError('Unexpected error, please try again.');
        setStatusMessage('');
      }
    } finally {
      setLoading(false);
    }
  };

  if (restoringSession) {
    return (
      <View style={styles.homeScreen}>
        <ActivityIndicator color="#B8C3FF" />
        <Text style={styles.homeSubtitle}>Restoring session...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (authenticatedUser) {
    return (
      <View style={styles.homeScreen}>
        <View style={styles.homeCard}>
          <Text style={styles.homeTitle}>Homepage</Text>
          <Text style={styles.homeSubtitle}>Welcome, {authenticatedUser.email}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => {
              setAuthToken(null);
              void Promise.all([
                AsyncStorage.removeItem(STORAGE_KEYS.token),
                AsyncStorage.removeItem(STORAGE_KEYS.user),
              ]);
              setAuthenticatedUser(null);
              setEmail('');
              setPassword('');
              setAuthError('');
              setStatusMessage('');
              setMode('login');
            }}
          >
            <Text style={styles.secondaryButtonText}>Log Out</Text>
          </Pressable>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.backgroundPulseTop} />
      <View style={styles.backgroundPulseBottom} />

      <View style={styles.container}>
        <View style={styles.logoSection}>
          <View style={styles.logoWrapper}>
            <View style={styles.logoCircle}>
              <Image
                source={require('./assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.title}>SHFI</Text>
        </View>

        <View style={styles.formSection}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#8E90A2"
            style={styles.input}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (authError) {
                setAuthError('');
              }
            }}
            editable={!loading}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#8E90A2"
            style={styles.input}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (authError) {
                setAuthError('');
              }
            }}
            editable={!loading}
          />

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
          {statusMessage ? <Text style={styles.successText}>{statusMessage}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#EFEFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setAuthError('');
              setStatusMessage('');
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>{secondaryButtonLabel}</Text>
          </Pressable>
        </View>
      </View>

      <StatusBar style="light" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131314',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backgroundPulseTop: {
    position: 'absolute',
    top: -120,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(46, 91, 255, 0.12)',
  },
  backgroundPulseBottom: {
    position: 'absolute',
    bottom: -100,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(46, 91, 255, 0.1)',
  },
  container: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  logoSection: {
    marginBottom: 56,
    alignItems: 'center',
    gap: 12,
  },
  logoWrapper: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#1C1B1C',
    borderWidth: 1,
    borderColor: '#353436',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 62,
    height: 62,
  },
  title: {
    color: '#E5E2E3',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  formSection: {
    width: '100%',
    gap: 12,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#434656',
    backgroundColor: '#1C1B1C',
    color: '#E5E2E3',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primaryButton: {
    height: 56,
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#2E5BFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2E5BFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: '#EFEFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#353436',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.92,
  },
  secondaryButtonText: {
    color: '#E5E2E3',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#FFB4AB',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  successText: {
    color: '#A6B4FF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  homeScreen: {
    flex: 1,
    backgroundColor: '#131314',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  homeCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: '#1C1B1C',
    borderWidth: 1,
    borderColor: '#353436',
    padding: 20,
    gap: 14,
  },
  homeTitle: {
    color: '#E5E2E3',
    fontSize: 28,
    fontWeight: '800',
  },
  homeSubtitle: {
    color: '#C4C5D9',
    fontSize: 16,
    marginBottom: 8,
  },
});
