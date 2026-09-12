import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { TEAMS } from '../constants/teams';
import {
  Standing, Scorer, Fixture,
  fetchSeason, fetchStanding, fetchTeamScorers, teamFixtures, fetchStandingsSorted,
} from '../services/league';
import NightBackground from '../components/NightBackground';
import TeamBadge from '../components/TeamBadge';
import { colors, font, radius, spacing } from '../theme';

const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;

export default function TeamScreen({ navigation }: any) {
  const { profile } = useAuth();
  const teamId = profile?.teamId ?? '';
  const [standing, setStanding] = useState<Standing | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [scorers, setScorers] = useState<Scorer[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const season = await fetchSeason();
      if (!season || !teamId) { setLoading(false); return; }
      const [st, sc, table] = await Promise.all([
        fetchStanding(season.seasonId, teamId),
        fetchTeamScorers(teamId),
        fetchStandingsSorted(season.seasonId),
      ]);
      setStanding(st);
      setScorers(sc);
      setFixtures(teamFixtures(season, teamId).filter((f) => !f.isPast).slice(0, 6));
      const idx = table.findIndex((r) => r.teamId === teamId);
      setPosition(idx >= 0 ? idx + 1 : null);
      setLoading(false);
    })();
  }, [teamId]);

  const sg = standing ? standing.goalsFor - standing.goalsAgainst : 0;

  return (
    <NightBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.chalk} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MEU TIME</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.turf} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Cabeçalho do time */}
          <View style={styles.hero}>
            <TeamBadge teamId={teamId} size={84} />
            <Text style={styles.teamName}>{teamName(teamId)}</Text>
            {position != null && (
              <Text style={styles.position}>
                {position}º lugar · <Text style={{ color: colors.turf }}>{standing?.points ?? 0} pts</Text>
              </Text>
            )}
          </View>

          {/* Campanha */}
          <View style={styles.statsRow}>
            {[
              { v: standing?.wins ?? 0, l: 'V' },
              { v: standing?.draws ?? 0, l: 'E' },
              { v: standing?.losses ?? 0, l: 'D' },
              { v: sg > 0 ? `+${sg}` : sg, l: 'SG' },
            ].map((s) => (
              <View key={s.l} style={styles.statCell}>
                <Text style={styles.statVal}>{s.v}</Text>
                <Text style={styles.statLbl}>{s.l}</Text>
              </View>
            ))}
          </View>

          {/* Artilheiros do time */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <MaterialCommunityIcons name="target" size={16} color={colors.flood} />
              <Text style={styles.sectionTitle}>Artilheiros da torcida</Text>
            </View>
            {scorers.length === 0 ? (
              <Text style={styles.empty}>Ninguém marcou pelo time ainda. Seja você o craque.</Text>
            ) : (
              scorers.map((s, i) => (
                <View key={s.uid + i} style={[styles.scorerRow, i === scorers.length - 1 && styles.noBorder]}>
                  <Text style={styles.scorerPos}>{i + 1}</Text>
                  <Text style={styles.scorerNick} numberOfLines={1}>{s.nick}</Text>
                  <Text style={styles.scorerGoals}>{s.goals}</Text>
                  <Text style={styles.scorerUnit}>gols</Text>
                </View>
              ))
            )}
          </View>

          {/* Próximos jogos */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color={colors.turf} />
              <Text style={styles.sectionTitle}>Próximos jogos</Text>
            </View>
            {fixtures.length === 0 ? (
              <Text style={styles.empty}>Temporada encerrada.</Text>
            ) : (
              fixtures.map((f, i) => (
                <View key={f.round} style={[styles.fixRow, i === fixtures.length - 1 && styles.noBorder]}>
                  <Text style={styles.fixRound}>R{f.round}</Text>
                  <TeamBadge teamId={f.opponent} size={26} />
                  <Text style={styles.fixOpp} numberOfLines={1}>{teamName(f.opponent)}</Text>
                  <Text style={styles.fixSide}>{f.side === 'home' ? 'CASA' : 'FORA'}</Text>
                  {f.isCurrent && <Text style={styles.fixLive}>AGORA</Text>}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  back: { width: 26 },
  headerTitle: { color: colors.chalk, fontFamily: font.poster, fontSize: 20, letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: 40 },

  hero: { alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  teamName: { color: colors.chalk, fontFamily: font.poster, fontSize: 26 },
  position: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 14 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCell: { flex: 1, backgroundColor: colors.panel, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  statVal: { color: colors.chalk, fontFamily: font.score, fontSize: 24 },
  statLbl: { color: colors.haze, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 1, marginTop: 2 },

  section: { backgroundColor: colors.panel, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  sectionTitle: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 14 },
  empty: { color: colors.hazeDim, fontFamily: font.body, fontSize: 13, textAlign: 'center', paddingVertical: spacing.sm },
  noBorder: { borderBottomWidth: 0 },

  scorerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  scorerPos: { color: colors.haze, fontFamily: font.score, fontSize: 17, width: 20, textAlign: 'center' },
  scorerNick: { flex: 1, color: colors.chalk, fontFamily: font.bodyMed, fontSize: 14 },
  scorerGoals: { color: colors.turf, fontFamily: font.score, fontSize: 18 },
  scorerUnit: { color: colors.hazeDim, fontFamily: font.body, fontSize: 11 },

  fixRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  fixRound: { color: colors.haze, fontFamily: font.scoreMed, fontSize: 14, width: 30 },
  fixOpp: { flex: 1, color: colors.chalk, fontFamily: font.bodyMed, fontSize: 14 },
  fixSide: { color: colors.hazeDim, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.5 },
  fixLive: { color: colors.flood, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.5 },
});
