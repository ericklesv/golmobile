import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { TEAMS } from '../constants/teams';
import { useAuth } from '../context/AuthContext';
import {
  Season, Standing, Match,
  fetchSeason, subscribeStandings, fetchRoundMatches, formatMatchTimeLeft,
} from '../services/league';

const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;
const teamShield = (id: string) => TEAMS.find((t) => t.id === id)?.shield ?? '⚽';

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

  // Tabela ao vivo
  useEffect(() => {
    if (!season) return;
    const unsub = subscribeStandings(season.seasonId, setStandings);
    return unsub;
  }, [season?.seasonId]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#00e676" /></View>;
  }
  if (!season) {
    return <View style={styles.center}><Text style={styles.empty}>Temporada ainda não iniciada.</Text></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00e676" />}
    >
      <Text style={styles.title}>🏆 Brasileirão</Text>
      <Text style={styles.subtitle}>Temporada {season.seasonId} · Rodada {season.round}/{season.totalRounds}</Text>

      {/* Jogos da rodada */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Jogos da rodada</Text>
        {matches.length === 0 ? (
          <Text style={styles.empty}>Sem jogos nesta rodada.</Text>
        ) : (
          matches.map((m) => {
            const myTeam = profile?.teamId === m.homeTeam || profile?.teamId === m.awayTeam;
            return (
              <View key={m.id} style={[styles.matchRow, myTeam && styles.matchRowMine]}>
                <Text style={styles.matchSide} numberOfLines={1}>
                  {teamShield(m.homeTeam)} {teamName(m.homeTeam)}
                </Text>
                <View style={styles.matchCenter}>
                  <Text style={styles.matchScore}>{m.homeGoals} : {m.awayGoals}</Text>
                  <Text style={styles.matchStatus}>
                    {m.status === 'finished' ? 'FIM' : formatMatchTimeLeft(m.endsAt).replace('termina em ', '')}
                  </Text>
                </View>
                <Text style={[styles.matchSide, styles.matchSideRight]} numberOfLines={1}>
                  {teamName(m.awayTeam)} {teamShield(m.awayTeam)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Tabela */}
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
            <View key={row.teamId} style={[styles.tableRow, mine && styles.tableRowMine]}>
              <Text style={[styles.td, styles.colPos, i < 4 && styles.posTop]}>{i + 1}</Text>
              <Text style={[styles.td, styles.colTeam]} numberOfLines={1}>
                {teamShield(row.teamId)} {teamName(row.teamId)}
              </Text>
              <Text style={[styles.td, styles.colNum, styles.tdPoints]}>{row.points}</Text>
              <Text style={[styles.td, styles.colNum]}>{row.played}</Text>
              <Text style={[styles.td, styles.colNum]}>{sg > 0 ? `+${sg}` : sg}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#8fa3bf', fontSize: 13, textAlign: 'center', marginTop: 2, marginBottom: 16 },
  empty: { color: '#556', fontSize: 13, textAlign: 'center', paddingVertical: 10 },

  section: {
    backgroundColor: '#1a2a40', borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#2a3a50',
  },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },

  matchRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#0d1f35',
  },
  matchRowMine: { backgroundColor: '#00e6760f', borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  matchSide: { flex: 1, color: '#cdd8e8', fontSize: 12.5, fontWeight: '600' },
  matchSideRight: { textAlign: 'right' },
  matchCenter: { alignItems: 'center', paddingHorizontal: 10, minWidth: 64 },
  matchScore: { color: '#fff', fontSize: 15, fontWeight: '800' },
  matchStatus: { color: '#7d8ba0', fontSize: 9.5, fontWeight: '700', marginTop: 1 },

  tableHead: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: '#2a3a50',
  },
  th: { color: '#7d8ba0', fontSize: 11, fontWeight: '700' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#0d1f35',
  },
  tableRowMine: { backgroundColor: '#00e6760f', borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  td: { color: '#cdd8e8', fontSize: 13 },
  tdPoints: { color: '#fff', fontWeight: '800' },
  posTop: { color: '#00e676', fontWeight: '800' },
  colPos: { width: 26 },
  colTeam: { flex: 1 },
  colNum: { width: 34, textAlign: 'center' },
});
