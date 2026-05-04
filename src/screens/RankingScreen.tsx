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
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { TEAMS } from '../constants/teams';
import { getCurrentHourKey, getCurrentRoundKey } from '../utils/gameLogic';

type Tab = 'hour' | 'round' | 'season';

interface RankEntry {
  uid: string;
  nick: string;
  teamId: string;
  goals: number;
}

export default function RankingScreen() {
  const [tab, setTab] = useState<Tab>('hour');
  const [data, setData] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchRanking(currentTab: Tab) {
    setLoading(true);
    try {
      let collectionPath = '';
      if (currentTab === 'hour') collectionPath = `rankings/hour/entries`;
      if (currentTab === 'round') collectionPath = `rankings/round/entries`;
      if (currentTab === 'season') collectionPath = `rankings/season/entries`;

      const q = query(collection(db, collectionPath), orderBy('goals', 'desc'), limit(20));
      const snap = await getDocs(q);
      const entries: RankEntry[] = snap.docs.map((d) => d.data() as RankEntry);
      setData(entries);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchRanking(tab);
  }, [tab]);

  function onRefresh() {
    setRefreshing(true);
    fetchRanking(tab);
  }

  const tabLabels: Record<Tab, string> = {
    hour: '🕐 Hora',
    round: '🎲 Rodada',
    season: '🏆 Temporada',
  };

  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚽ Rankings</Text>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(Object.keys(tabLabels) as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {tabLabels[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#00e676" size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00e676" />}
          contentContainerStyle={styles.list}
        >
          {data.length === 0 && (
            <Text style={styles.empty}>Nenhum jogador no ranking ainda.\nSeja o primeiro! 🚀</Text>
          )}
          {data.map((entry, index) => {
            const team = TEAMS.find((t) => t.id === entry.teamId);
            const isTop3 = index < 3;
            return (
              <View key={entry.uid + index} style={[styles.row, isTop3 && styles.rowTop3]}>
                <Text style={[styles.position, isTop3 && { color: medalColors[index] }]}>
                  {index + 1}º
                </Text>
                <Text style={styles.shield}>{team?.shield ?? '⚽'}</Text>
                <View style={styles.playerInfo}>
                  <Text style={styles.nick}>{entry.nick}</Text>
                  <Text style={[styles.teamName, { color: team?.color ?? '#aaa' }]}>
                    {team?.name ?? ''}
                  </Text>
                </View>
                <Text style={styles.goals}>
                  {entry.goals} <Text style={styles.goalLabel}>gols</Text>
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
    paddingTop: 20,
  },
  title: {
    color: '#00e676',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#1a2a40',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#00e676',
  },
  tabText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#0a1628',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  empty: {
    color: '#555',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 50,
    lineHeight: 26,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2a40',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a3a50',
  },
  rowTop3: {
    borderColor: '#2a4a30',
    backgroundColor: '#162236',
  },
  position: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
    width: 36,
  },
  shield: {
    fontSize: 22,
    marginRight: 10,
  },
  playerInfo: {
    flex: 1,
  },
  nick: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamName: {
    fontSize: 12,
    marginTop: 2,
  },
  goals: {
    color: '#00e676',
    fontSize: 18,
    fontWeight: 'bold',
  },
  goalLabel: {
    fontSize: 12,
    color: '#888',
  },
});
