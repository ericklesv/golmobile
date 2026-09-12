import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { TEAMS, ACTION_COOLDOWNS } from '../constants/teams';
import NightBackground from '../components/NightBackground';
import TeamBadge from '../components/TeamBadge';
import { colors, font, radius, spacing } from '../theme';

export default function ProfileScreen() {
  const { profile, logout } = useAuth();
  const { confirm } = useToast();
  const team = TEAMS.find((t) => t.id === profile?.teamId);
  const totalGoals = profile?.totalGoals ?? 0;
  const totalKicks = profile?.totalKicks ?? 0;
  const conversion = totalKicks > 0 ? `${Math.round((totalGoals / totalKicks) * 100)}%` : '—';
  const cdMin = (id: string) => `${ACTION_COOLDOWNS[id] / 60000} min`;

  function handleLogout() {
    confirm({
      title: 'Sair da conta',
      message: 'Você vai precisar entrar de novo para jogar.',
      confirmText: 'Sair',
      cancelText: 'Ficar',
      destructive: true,
      onConfirm: logout,
    });
  }

  const stats = [
    { value: totalGoals, label: 'GOLS' },
    { value: totalKicks, label: 'CHUTES' },
    { value: conversion, label: 'APROVEITAMENTO' },
  ];

  return (
    <NightBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarWrap}>
          <TeamBadge teamId={profile?.teamId} size={92} />
        </View>
        <Text style={styles.nick}>{profile?.nick ?? ''}</Text>
        <Text style={styles.teamName}>{team?.name ?? ''}</Text>

        {/* Estatísticas */}
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Como jogar */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <MaterialCommunityIcons name="book-open-variant" size={16} color={colors.flood} />
            <Text style={styles.cardTitle}>Como jogar</Text>
          </View>
          <Text style={styles.rulesText}>
            Escolha um modo e chute. Cada gol soma para você nos rankings e para o seu time na partida do dia.
          </Text>
          <View style={styles.cdRow}>
            <Cooldown icon="lightning-bolt" label="Auto" value={cdMin('auto')} color={colors.turf} />
            <Cooldown icon="whistle" label="Falta" value={cdMin('falta')} color="#38BDF8" />
            <Cooldown icon="run-fast" label="Trilha" value={cdMin('trilha')} color="#FF7A59" />
            <Cooldown icon="soccer" label="Pênalti" value={cdMin('penalti')} color={colors.flood} />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
          <MaterialCommunityIcons name="logout" size={16} color={colors.red} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </NightBackground>
  );
}

function Cooldown({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={styles.cd}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={styles.cdValue}>{value}</Text>
      <Text style={styles.cdLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: 44, paddingBottom: 40, alignItems: 'center' },
  avatarWrap: { marginBottom: spacing.md },
  nick: { fontFamily: font.poster, fontSize: 28, color: colors.chalk },
  teamName: { fontFamily: font.bodyMed, fontSize: 14, color: colors.haze, marginBottom: spacing.xl },

  statsGrid: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginBottom: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: colors.panel, borderRadius: radius.md, paddingVertical: spacing.lg,
    alignItems: 'center', borderWidth: 1, borderColor: colors.line,
  },
  statValue: { color: colors.turf, fontFamily: font.score, fontSize: 28, includeFontPadding: false },
  statLabel: { color: colors.haze, fontFamily: font.bodyBold, fontSize: 9, letterSpacing: 0.8, marginTop: 4 },

  card: {
    width: '100%', backgroundColor: colors.panel, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.line,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  cardTitle: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 14 },
  rulesText: { color: colors.haze, fontFamily: font.body, fontSize: 13.5, lineHeight: 20, marginBottom: spacing.lg },
  cdRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cd: { alignItems: 'center', gap: 3, flex: 1 },
  cdValue: { color: colors.chalk, fontFamily: font.scoreMed, fontSize: 15 },
  cdLabel: { color: colors.hazeDim, fontFamily: font.body, fontSize: 10 },

  logoutButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.red,
    borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: 13,
  },
  logoutText: { color: colors.red, fontFamily: font.bodyBold, fontSize: 15 },
});
