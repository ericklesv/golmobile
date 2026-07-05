import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { TEAMS } from '../constants/teams';
import NightBackground from '../components/NightBackground';
import TeamBadge from '../components/TeamBadge';
import Field from '../components/Field';
import { colors, font, radius, spacing, glow } from '../theme';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const { toast } = useToast();
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!nick.trim() || !email.trim() || !password || !selectedTeam) {
      toast('Preencha os campos e escolha um time.', 'error');
      return;
    }
    if (password.length < 6) {
      toast('A senha precisa de pelo menos 6 caracteres.', 'error');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, nick.trim(), selectedTeam);
    } catch (e: any) {
      const code = e?.code ?? '';
      let msg = 'Confira os dados e tente novamente.';
      if (code === 'auth/email-already-in-use') msg = 'Esse e-mail já tem conta. Faça login.';
      else if (code === 'auth/weak-password') msg = 'Senha muito fraca. Use pelo menos 6 caracteres.';
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>ENTRAR EM CAMPO</Text>
          <Text style={styles.subtitle}>Crie seu jogador e escolha um time.</Text>

          <Field iconName="account-outline" placeholder="Seu nick" value={nick} onChangeText={setNick} maxLength={20} />
          <Field
            iconName="email-outline"
            placeholder="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field iconName="lock-outline" placeholder="Senha (mín. 6 caracteres)" value={password} onChangeText={setPassword} secureTextEntry />

          <Text style={styles.sectionLabel}>ESCOLHA SEU TIME</Text>
          <View style={styles.teamsGrid}>
            {TEAMS.map((team) => {
              const active = selectedTeam === team.id;
              return (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.teamCard, active && styles.teamCardActive]}
                  onPress={() => setSelectedTeam(team.id)}
                  activeOpacity={0.8}
                >
                  <TeamBadge teamId={team.id} size={34} />
                  <Text style={[styles.teamName, active && { color: colors.chalk }]} numberOfLines={1}>
                    {team.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.button, !selectedTeam && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading || !selectedTeam}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color={colors.night0} /> : <Text style={styles.buttonText}>COMEÇAR A JOGAR</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkWrap}>
            <Text style={styles.link}>Já tenho conta</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, paddingTop: 56, paddingBottom: 40, alignItems: 'center' },
  title: { fontFamily: font.poster, fontSize: 30, color: colors.chalk, letterSpacing: 1 },
  subtitle: { fontFamily: font.body, fontSize: 13, color: colors.haze, marginBottom: spacing.xl, marginTop: 2 },
  sectionLabel: {
    alignSelf: 'flex-start', color: colors.haze, fontFamily: font.bodyBold,
    fontSize: 11, letterSpacing: 1, marginBottom: spacing.md, marginTop: spacing.xs,
  },
  teamsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', marginBottom: spacing.xl },
  teamCard: {
    width: '31%', backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.line, alignItems: 'center', gap: 6, paddingVertical: spacing.md, marginBottom: spacing.sm,
  },
  teamCardActive: { borderColor: colors.turf, backgroundColor: colors.panelHi },
  teamName: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 10.5, textAlign: 'center' },
  button: {
    width: '100%', backgroundColor: colors.turf, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center', ...glow(colors.turfGlow, 14),
  },
  buttonDisabled: { backgroundColor: colors.turfDeep, shadowOpacity: 0 },
  buttonText: { color: colors.night0, fontFamily: font.bodyBold, fontSize: 16, letterSpacing: 1 },
  linkWrap: { marginTop: spacing.lg },
  link: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 14 },
});
