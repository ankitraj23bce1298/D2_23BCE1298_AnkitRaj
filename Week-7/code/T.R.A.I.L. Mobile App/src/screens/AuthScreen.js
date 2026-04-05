import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Image,
  Animated,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import authService from '../services/auth';

// A centralized color palette for consistency and easy theming.
const colors = {
  primary: '#3B82F6',
  primaryDark: '#1E40AF',
  background: '#F8FAFC',
  card: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textLight: '#FFFFFF',
  border: '#E2E8F0',
  divider: '#EEF2FF',
  white: '#FFFFFF',
};

export default function AuthScreen({ navigation }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const switchMode = (m) => {
    setMode(m);
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
  };

  const goToHomeAndReset = (tourist) => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{
          name: 'MainTabs',
          state: {
            index: 0,
            routes: [{ name: 'HomeTab', params: { tourist } }],
          },
        }],
      })
    );
  };

  const submit = async () => {
    if (!email || !password || (mode === 'signup' && !name)) {
      Alert.alert('Validation', 'Please fill all required fields.');
      return;
    }

    try {
      const res = mode === 'login'
        ? await authService.login(email, password)
        : await authService.signup({ name, email, password });

      if (res?.success) {
        goToHomeAndReset(res.user);
      } else {
        Alert.alert(
          mode === 'login' ? 'Login Failed' : 'Signup Failed',
          res?.message || 'An error occurred.'
        );
      }
    } catch (err) {
      console.warn(err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };
  
  const createInputProps = (field, setter) => ({
    onFocus: () => setFocusedInput(field),
    onBlur: () => setFocusedInput(null),
    onChangeText: setter,
    style: [styles.input, focusedInput === field && styles.inputFocused],
  });

  const handleSocialSignIn = (provider) => Alert.alert(`${provider} Sign-in`, 'Social sign-in is coming soon.');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandWrap}>
              <View style={styles.brandCircle}>
                <Image source={require('../assets/logo.png')} style={styles.brandLogo} resizeMode="cover" />
              </View>
              <Text style={styles.brandTitle}>Welcome to CITADEL</Text>
            </View>

            <View style={styles.segment}>
              <TouchableOpacity style={[styles.segmentButton, mode === 'login' && styles.segmentButtonActive]} onPress={() => switchMode('login')}><Text style={[styles.segmentText, mode === 'login' && styles.segmentTextActive]}>Login</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segmentButton, mode === 'signup' && styles.segmentButtonActive]} onPress={() => switchMode('signup')}><Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>Sign up</Text></TouchableOpacity>
            </View>

            <View style={styles.card}>
              {mode === 'signup' && (
                <TextInput placeholder="Full name" placeholderTextColor={colors.textSecondary} autoCapitalize="words" value={name} {...createInputProps('name', setName)} />
              )}
              <TextInput placeholder="Email" placeholderTextColor={colors.textSecondary} keyboardType="email-address" autoCapitalize="none" value={email} {...createInputProps('email', setEmail)} />
              <View style={styles.passwordRow}>
                <TextInput placeholder="Password" placeholderTextColor={colors.textSecondary} secureTextEntry={!showPassword} autoCapitalize="none" value={password} {...createInputProps('password', setPassword)} style={[styles.input, { flex: 1, marginBottom: 0 }]} />
                <TouchableOpacity style={styles.showBtn} onPress={() => setShowPassword(s => !s)}><Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text></TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={submit}><Text style={styles.primaryBtnText}>{mode === 'login' ? 'Login' : 'Create Account'}</Text></TouchableOpacity>
              
              <View style={styles.rowBetween}>
                <TouchableOpacity onPress={() => Alert.alert('Forgot password', 'Password reset flow coming soon.')}><Text style={styles.linkText}>Forgot password?</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => goToHomeAndReset({ id: 'demo', name: 'Demo User' })}><Text style={styles.linkText}>Skip (Demo)</Text></TouchableOpacity>
              </View>

              <View style={styles.dividerRow}><View style={styles.dividerLine} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.dividerLine} /></View>
              
              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => handleSocialSignIn('Google')}><View style={styles.socialBadge}><Text style={[styles.socialBadgeText, { color: '#DB4437' }]}>G</Text></View><Text style={styles.socialBtnText}>Google</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.socialBtn, { marginLeft: 12 }]} onPress={() => handleSocialSignIn('Apple')}><View style={[styles.socialBadge, { backgroundColor: '#000' }]}><Text style={[styles.socialBadgeText, { color: '#fff', fontSize: 18 }]}></Text></View><Text style={styles.socialBtnText}>Apple</Text></TouchableOpacity>
              </View>
            </View>
            <View style={{ height: 36 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, // Seamless header color
  contentContainer: { flex: 1, backgroundColor: colors.background },
  container: {
    paddingHorizontal: 24,
    paddingTop: 15,
    paddingBottom: 40,
  },

  brandWrap: { alignItems: 'center', marginBottom: 24 },
  brandCircle: {
    width: 100, height: 100, borderRadius: 24, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 10,
    shadowColor: colors.primary, shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, marginBottom: 16, overflow: 'hidden',
  },
  brandLogo: { width: 90, height: 90, borderRadius: 18 },
  brandTitle: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 },
  brandSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: '80%' },

  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.white, padding: 6, borderRadius: 16, elevation: 5, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, marginBottom: 10 },
  segmentButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, minWidth: 120, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  segmentTextActive: { color: colors.white },

  card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, elevation: 5, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: colors.border },
  input: {
    borderWidth: 2, borderColor: colors.border, backgroundColor: '#FBFDFF', paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, marginBottom: 14, fontSize: 16, color: colors.textPrimary, fontWeight: '500',
  },
  inputFocused: { borderColor: colors.primary },
  
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  showBtn: { marginLeft: 10, padding: 10 },
  showText: { color: colors.primary, fontWeight: '700' },

  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 8, elevation: 4, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  primaryBtnText: { color: colors.white, fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  linkText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { marginHorizontal: 12, color: colors.textSecondary, fontWeight: '600' },

  socialRow: { flexDirection: 'row' },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    padding: 10, borderRadius: 12, backgroundColor: colors.white, justifyContent: 'center',
  },
  socialBadge: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10,
    backgroundColor: colors.white,
  },
  socialBadgeText: { fontWeight: '900', fontSize: 16 },
  socialBtnText: { fontWeight: '700', color: colors.textPrimary, fontSize: 14 },
});
