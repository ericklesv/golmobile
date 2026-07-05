import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { TEAMS } from '../constants/teams';
import { getCurrentHourKey, getCurrentRoundKey } from '../utils/gameLogic';
import NightBackground from '../components/NightBackground';
import TeamBadge from '../components/TeamBadge';
import { colors, font, radius, spacing } from '../theme';

type Tab = 'hour' | 'round' | 'season';

interface RankEntry {
  uid: string;
  nick: string;
  teamId: string;
  goals: number;
}

const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? '';

export default function RankingScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('hour');
  const [data, setData] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchRanking(currentTab: Tab) {
    setLoading(true);
    try {
      const collectionPath = `rankings/${currentTab}/entries`;
      // Hora e rodada filtram pela janela ATUAL — sem isso o ranking mistura o histórico
      const constraints: QueryConstraint[] = [];
      if (currentTab === 'hour') constraints.push(where('hourKey', '==', getCurrentHourKey()));
      if (currentTab === 'round') constraints.push(where('roundKey', '==', getCurrentRoundKey()));
      constraints.push(orderBy('goals', 'desc'), limit(20));

      const q = query(collection(db, collectionPath), ...constraints);
      const snap = await getDocs(q);
      setData(snap.docs.map((d) => d.data() as RankEntry));
    } catch {
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchRanking(tab); }, [tab]);

  function onRefresh() {
    setRefreshing(true);
    fetchRanking(tab);
  }

  const tabLabels: Record<Tab, string> = { hour: 'Hora', round: 'Rodada', season: 'Temporada' };
  const medalColors = [colors.flood, '#C7D0DB', '#D08A4B'];

  return (
    <NightBackground>
      <View style={styles.header}>
        <Text style={styles.title}>ARTILHARIA</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(Object.keys(tabLabels) as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{tabLabels[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.turf} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turf} />}
          contentContainerStyle={styles.list}
        >
          {data.length === 0 && (
            <Text style={styles.empty}>Nenhum gol nesta janela ainda.{'\n'}Seja o primeiro a aparecer aqui.</Text>
          )}
          {data.map((entry, index) => {
            const isTop3 = index < 3;
            const mine = entry.uid === profile?.uid;
            return (
              <View key={entry.uid + index} style={[styles.row, isTop3 && styles.rowTop3, mine && styles.rowMine]}>
                <Text style={[styles.position, isTop3 && { color: medalColors[index] }]}>{index + 1}</Text>
                <TeamBadge teamId={entry.teamId} size={34} />
                <View style={styles.playerInfo}>
                  <Text style={styles.nick} numberOfLines={1}>{entry.nick}</Text>
                  <Text style={styles.teamName} numberOfLines={1}>{teamName(entry.teamId)}</Text>
                </View>
                <Text style={styles.goals}>{entry.goals}</Text>
                <Text style={styles.goalLabel}>gols</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.xl, paddingBottom: spacing.md, alignItems: 'center' },
  title: { color: colors.chalk, fontFamily: font.poster, fontSize: 26, letterSpacing: 1 },
  tabs: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.night0, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.line,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.turf },
  tabText: { color: colors.haze, fontFamily: font.bodyBold, fontSize: 12.5, letterSpacing: 0.3 },
  tabTextActive: { color: colors.night0 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 30 },
  empty: { color: colors.hazeDim, textAlign: 'center', fontFamily: font.body, fontSize: 14, marginTop: 50, lineHeight: 22 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.panel, borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line,
  },
  rowTop3: { backgroundColor: colors.panelHi },
  rowMine: { borderColor: colors.turf },
  position: { color: colors.haze, fontFamily: font.score, fontSize: 20, width: 26, textAlign: 'center' },
  playerInfo: { flex: 1 },
  nick: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 15 },
  teamName: { color: colors.haze, fontFamily: font.body, fontSize: 12, marginTop: 1 },
  goals: { color: colors.turf, fontFamily: font.score, fontSize: 22 },
  goalLabel: { color: colors.hazeDim, fontFamily: font.body, fontSize: 11 },
});
