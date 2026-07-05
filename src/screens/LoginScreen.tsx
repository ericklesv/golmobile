import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import NightBackground from '../components/NightBackground';
import Field from '../components/Field';
import { colors, font, radius, spacing, glow } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      toast('Preencha e-mail e senha.', 'error');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      const code = e?.code ?? '';
      let msg = 'E-mail ou senha incorretos.';
      if (code === 'auth/user-not-found') msg = 'Não encontramos uma conta com esse e-mail.';
      else if (code === 'auth/wrong-password') msg = 'Senha incorreta. Tente de novo.';
      else if (code === 'auth/invalid-email') msg = 'Esse e-mail não parece válido.';
      else if (code === 'auth/network-request-failed') msg = 'Sem conexão. Verifique a internet.';
      else if (code) msg = `Erro: ${code}`;
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <NightBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.logoLockup}>
          <View style={styles.logoBall}>
            <MaterialCommunityIcons name="soccer" size={30} color={colors.night0} />
          </View>
          <Text style={styles.wordmark}>
            GOL<Text style={{ color: colors.turf }}>MOBILE</Text>
          </Text>
        </View>
        <Text style={styles.tagline}>Chute, marque e leve seu time ao topo.</Text>

        <Field
          iconName="email-outline"
          placeholder="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          iconName="lock-outline"
          placeholder="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color={colors.night0} /> : <Text style={styles.buttonText}>ENTRAR EM CAMPO</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkWrap}>
          <Text style={styles.link}>Ainda não joga? <Text style={styles.linkStrong}>Criar conta grátis</Text></Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  logoLockup: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  logoBall: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.turf,
    alignItems: 'center', justifyContent: 'center', ...glow(colors.turfGlow, 18),
  },
  wordmark: { fontFamily: font.poster, fontSize: 40, color: colors.chalk, letterSpacing: 1 },
  tagline: { fontFamily: font.body, fontSize: 14, color: colors.haze, marginBottom: spacing.xxl, textAlign: 'center' },
  button: {
    width: '100%', backgroundColor: colors.turf, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: spacing.xs, ...glow(colors.turfGlow, 14),
  },
  buttonText: { color: colors.night0, fontFamily: font.bodyBold, fontSize: 16, letterSpacing: 1 },
  linkWrap: { marginTop: spacing.xl },
  link: { color: colors.haze, fontFamily: font.body, fontSize: 14 },
  linkStrong: { color: colors.turf, fontFamily: font.bodyBold },
});
