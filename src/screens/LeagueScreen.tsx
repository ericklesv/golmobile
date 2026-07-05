import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { TEAMS } from '../constants/teams';
import { useAuth } from '../context/AuthContext';
import {
  Season, Standing, Match,
  fetchSeason, subscribeStandings, fetchRoundMatches, formatMatchTimeLeft,
} from '../services/league';
import NightBackground from '../components/NightBackground';
import TeamBadge from '../components/TeamBadge';
import { colors, font, radius, spacing } from '../theme';

const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;

export default function LeagueScreen() {
  const { profile } = useAuth();
  const [season, setSeason] = useState<Season | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const s = await fetchSeason();
    setSeason(s);
    if (s) setMatches(await fetchRoundMatches(s.seasonId, s.round));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!season) return;
    const unsub = subscribeStandings(season.seasonId, setStandings);
    return unsub;
  }, [season?.seasonId]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return <NightBackground><View style={styles.center}><ActivityIndicator color={colors.turf} /></View></NightBackground>;
  }
  if (!season) {
    return <NightBackground><View style={styles.center}><Text style={styles.empty}>A temporada vai começar em breve.</Text></View></NightBackground>;
  }

  return (
    <NightBackground>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turf} />}
      >
        <Text style={styles.title}>BRASILEIRÃO</Text>
        <Text style={styles.subtitle}>Temporada {season.seasonId} · Rodada {season.round}/{season.totalRounds}</Text>

        {/* Jogos da rodada */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jogos da rodada</Text>
          {matches.length === 0 ? (
            <Text style={styles.empty}>Sem jogos nesta rodada.</Text>
          ) : (
            matches.map((m, i) => {
              const mine = profile?.teamId === m.homeTeam || profile?.teamId === m.awayTeam;
              return (
                <View key={m.id} style={[styles.matchRow, mine && styles.mineRow, i === matches.length - 1 && styles.noBorder]}>
                  <View style={styles.matchHome}>
                    <Text style={styles.matchTeam} numberOfLines={1}>{teamName(m.homeTeam)}</Text>
                    <TeamBadge teamId={m.homeTeam} size={26} />
                  </View>
                  <View style={styles.matchCenter}>
                    <Text style={styles.matchScore}>{m.homeGoals} : {m.awayGoals}</Text>
                    <Text style={styles.matchStatus}>
                      {m.status === 'finished' ? 'FIM' : formatMatchTimeLeft(m.endsAt).replace('termina em ', '')}
                    </Text>
                  </View>
                  <View style={styles.matchAway}>
                    <TeamBadge teamId={m.awayTeam} size={26} />
                    <Text style={styles.matchTeam} numberOfLines={1}>{teamName(m.awayTeam)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Classificação */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Classificação</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colPos]}>#</Text>
            <Text style={[styles.th, styles.colTeam]}>Time</Text>
            <Text style={[styles.th, styles.colNum]}>P</Text>
            <Text style={[styles.th, styles.colNum]}>J</Text>
            <Text style={[styles.th, styles.colNum]}>SG</Text>
          </View>
          {standings.map((row, i) => {
            const mine = row.teamId === profile?.teamId;
            const sg = row.goalsFor - row.goalsAgainst;
            return (
              <View key={row.teamId} style={[styles.tableRow, mine && styles.mineRow]}>
                <Text style={[styles.pos, i < 4 && styles.posTop]}>{i + 1}</Text>
                <View style={styles.teamCell}>
                  <TeamBadge teamId={row.teamId} size={22} />
                  <Text style={styles.teamCellName} numberOfLines={1}>{teamName(row.teamId)}</Text>
                </View>
                <Text style={[styles.num, styles.numPoints]}>{row.points}</Text>
                <Text style={styles.num}>{row.played}</Text>
                <Text style={styles.num}>{sg > 0 ? `+${sg}` : sg}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.chalk, fontFamily: font.poster, fontSize: 28, textAlign: 'center', letterSpacing: 1 },
  subtitle: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 13, textAlign: 'center', marginTop: 2, marginBottom: spacing.lg },
  empty: { color: colors.hazeDim, fontFamily: font.body, fontSize: 13, textAlign: 'center', paddingVertical: spacing.md },

  section: {
    backgroundColor: colors.panel, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line,
  },
  sectionTitle: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 14, marginBottom: spacing.md },

  matchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  noBorder: { borderBottomWidth: 0 },
  mineRow: { backgroundColor: colors.turfGlow, borderRadius: radius.sm, marginHorizontal: -6, paddingHorizontal: 6, borderBottomColor: 'transparent' },
  matchHome: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
  matchAway: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  matchTeam: { color: colors.chalk, fontFamily: font.bodyMed, fontSize: 12.5, flexShrink: 1 },
  matchCenter: { alignItems: 'center', paddingHorizontal: spacing.md, minWidth: 68 },
  matchScore: { color: colors.chalk, fontFamily: font.score, fontSize: 18 },
  matchStatus: { color: colors.hazeDim, fontFamily: font.bodyBold, fontSize: 9, marginTop: 1 },

  tableHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  th: { color: colors.hazeDim, fontFamily: font.bodyBold, fontSize: 10.5, letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  pos: { color: colors.haze, fontFamily: font.score, fontSize: 16, width: 26, textAlign: 'center' },
  posTop: { color: colors.turf },
  teamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamCellName: { color: colors.chalk, fontFamily: font.bodyMed, fontSize: 13, flexShrink: 1 },
  num: { color: colors.haze, fontFamily: font.scoreMed, fontSize: 15, width: 34, textAlign: 'center' },
  numPoints: { color: colors.chalk },
  colPos: { width: 26, textAlign: 'center' },
  colTeam: { flex: 1 },
  colNum: { width: 34, textAlign: 'center' },
});
