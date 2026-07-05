import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TeamBadge from './TeamBadge';
import { TEAMS } from '../constants/teams';
import { colors, font, radius, spacing, glow } from '../theme';
import { formatMatchTimeLeft } from '../services/league';

const DAY = 24 * 60 * 60 * 1000;
const abbr = (id: string) => TEAMS.find((t) => t.id === id)?.abbr ?? '—';

/**
 * Placar ao vivo — a assinatura visual do app. Numerais altos de placar,
 * brilho âmbar de refletor, barra de tempo restante da partida de 24h.
 */
export default function Scoreboard({
  myTeamId,
  myGoals,
  oppTeamId,
  oppGoals,
  round,
  endsAt,
  durationMs = DAY,
}: {
  myTeamId: string;
  myGoals: number;
  oppTeamId: string;
  oppGoals: number;
  round: number;
  endsAt: number;
  durationMs?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const leading = myGoals > oppGoals;
  const drawing = myGoals === oppGoals;
  const remaining = Math.max(0, Math.min(1, (endsAt - Date.now()) / durationMs));

  const status = leading
    ? 'Seu time está na frente. Faça mais gols!'
    : drawing
    ? 'Tudo igual. Cada gol seu decide.'
    : 'Seu time está atrás. Bora virar!';

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#16324F', '#0E2137']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.amberEdge} />

      {/* eyebrow */}
      <View style={styles.eyebrow}>
        <View style={styles.liveWrap}>
          <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
        <Text style={styles.round}>RODADA {round}</Text>
        <Text style={styles.timeLeft}>{formatMatchTimeLeft(endsAt).replace('termina em ', '⏱ ')}</Text>
      </View>

      {/* placar */}
      <View style={styles.scoreRow}>
        <View style={styles.team}>
          <TeamBadge teamId={myTeamId} size={46} />
          <Text style={styles.teamAbbr}>{abbr(myTeamId)}</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={[styles.score, leading && styles.scoreLead]}>{myGoals}</Text>
          <Text style={styles.colon}>:</Text>
          <Text style={styles.score}>{oppGoals}</Text>
        </View>
        <View style={styles.team}>
          <TeamBadge teamId={oppTeamId} size={46} />
          <Text style={styles.teamAbbr}>{abbr(oppTeamId)}</Text>
        </View>
      </View>

      {/* barra de tempo restante */}
      <View style={styles.timeTrack}>
        <View style={[styles.timeFill, { width: `${remaining * 100}%` }]} />
      </View>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.floodGlow,
    ...glow(colors.floodGlow, 18),
  },
  amberEdge: {
    position: 'absolute',
    top: 0,
    left: '30%',
    right: '30%',
    height: 2,
    backgroundColor: colors.flood,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  liveText: { fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.red },
  round: { fontFamily: font.scoreMed, fontSize: 13, letterSpacing: 1, color: colors.haze, flex: 1, textAlign: 'center' },
  timeLeft: { fontFamily: font.bodyMed, fontSize: 11, color: colors.flood, flex: 1, textAlign: 'right' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  team: { alignItems: 'center', gap: 5, width: 64 },
  teamAbbr: { fontFamily: font.scoreMed, fontSize: 13, letterSpacing: 1, color: colors.chalk },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  score: {
    fontFamily: font.score,
    fontSize: 52,
    color: colors.chalk,
    includeFontPadding: false,
    minWidth: 40,
    textAlign: 'center',
  },
  scoreLead: { color: colors.flood, textShadowColor: colors.floodGlow, textShadowRadius: 12 },
  colon: { fontFamily: font.score, fontSize: 34, color: colors.hazeDim, includeFontPadding: false },

  timeTrack: { height: 4, borderRadius: 2, backgroundColor: colors.night0, marginTop: spacing.lg, overflow: 'hidden' },
  timeFill: { height: '100%', backgroundColor: colors.flood, borderRadius: 2 },
  status: { fontFamily: font.body, fontSize: 12, color: colors.haze, textAlign: 'center', marginTop: spacing.md },
});
