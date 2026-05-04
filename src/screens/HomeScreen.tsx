import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ScrollView,
} from 'react-native';
import {
  doc,
  updateDoc,
  increment,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { TEAMS, KICK_COOLDOWN_MS } from '../constants/teams';
import {
  rollKick,
  getTimeRemaining,
  formatCountdown,
  getCurrentHourKey,
  getCurrentRoundKey,
} from '../utils/gameLogic';

const KICK_TYPES = [
  { id: 'penalti', label: '🥅 Pênalti' },
  { id: 'falta', label: '🌀 Falta' },
];

interface TopPlayer { nick: string; teamId: string; goals: number; }
interface Activity { id: string; nick: string; teamId: string; goal: boolean; kickType: string; ts: number; }

export default function HomeScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const [countdown, setCountdown] = useState(0);
  const [canKick, setCanKick] = useState(false);
  const [lastResult, setLastResult] = useState<null | { goal: boolean; message: string }>(null);
  const [kicking, setKicking] = useState(false);
  const [kickType, setKickType] = useState<'penalti' | 'falta'>('penalti');
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [onlineCount] = useState(Math.floor(Math.random() * 20) + 5);
  const [progress, setProgress] = useState(1);

  const ballAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  const team = TEAMS.find((t) => t.id === profile?.teamId);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!profile) return;
      const remaining = getTimeRemaining(profile.lastKickTime, KICK_COOLDOWN_MS);
      setCountdown(remaining);
      setCanKick(remaining === 0);
      setProgress(remaining === 0 ? 1 : 1 - remaining / KICK_COOLDOWN_MS);
    }, 500);
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    async function fetchTop() {
      try {
        const q = query(collection(db, 'rankings', 'hour', 'entries'), orderBy('goals', 'desc'), limit(3));
        const snap = await getDocs(q);
        setTopPlayers(snap.docs.map((d) => d.data() as TopPlayer));
      } catch {}
    }
    fetchTop();
  }, [lastResult]);

  useEffect(() => {
    const q = query(collection(db, 'activities'), orderBy('ts', 'desc'), limit(8));
    const unsub = onSnapshot(q, (snap) => {
      setActivities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Activity)));
    });
    return unsub;
  }, []);

  function animateBall(goal: boolean) {
    ballAnim.setValue(0);
    scaleAnim.setValue(1);
    resultOpacity.setValue(0);
    if (goal) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.7, duration: 80, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1.4, friction: 3, useNativeDriver: true }),
        Animated.timing(ballAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
    Animated.timing(resultOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }

  async function handleKick() {
    if (!user || !profile || !canKick || kicking) return;
    setKicking(true);
    const isGoal = rollKick();
    animateBall(isGoal);
    const hourKey = getCurrentHourKey();
    const roundKey = getCurrentRoundKey();
    try {
      const userRef = doc(db, 'users', user.uid);
      const updates: Record<string, any> = { lastKickTime: Date.now() };
      if (isGoal) {
        updates.totalGoals = increment(1);
        const hourRef = doc(db, 'rankings', 'hour', 'entries', `${user.uid}_${hourKey}`);
        await updateDoc(hourRef, { goals: increment(1) }).catch(() =>
          import('firebase/firestore').then(({ setDoc }) =>
            setDoc(hourRef, { uid: user.uid, nick: profile.nick, teamId: profile.teamId, goals: 1, hourKey })
          )
        );
        const roundRef = doc(db, 'rankings', 'round', 'entries', `${user.uid}_${roundKey}`);
        await updateDoc(roundRef, { goals: increment(1) }).catch(() =>
          import('firebase/firestore').then(({ setDoc }) =>
            setDoc(roundRef, { uid: user.uid, nick: profile.nick, teamId: profile.teamId, goals: 1, roundKey })
          )
        );
        const seasonRef = doc(db, 'rankings', 'season', 'entries', user.uid);
        await updateDoc(seasonRef, { goals: increment(1) }).catch(() =>
          import('firebase/firestore').then(({ setDoc }) =>
            setDoc(seasonRef, { uid: user.uid, nick: profile.nick, teamId: profile.teamId, goals: 1 })
          )
        );
      }
      await updateDoc(userRef, updates);
      await addDoc(collection(db, 'activities'), {
        uid: user.uid,
        nick: profile.nick,
        teamId: profile.teamId,
        goal: isGoal,
        kickType,
        ts: Date.now(),
      });
      await refreshProfile();
      setLastResult(isGoal ? { goal: true, message: '⚽ GOOOOOL!' } : { goal: false, message: '❌ Defendido!' });
    } catch {
      Alert.alert('Erro', 'Tente novamente.');
    } finally {
      setKicking(false);
    }
  }

  const ballTranslateY = ballAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -100] });
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Card do jogador */}
      <View style={styles.playerCard}>
        <View style={styles.playerRow}>
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarLetter}>{profile?.nick?.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.playerNick}>{profile?.nick ?? '...'}</Text>
            <View style={styles.teamRow}>
              <Text style={styles.teamEmoji}>{team?.shield ?? '⚽'}</Text>
              <Text style={[styles.teamName, { color: team?.color ?? '#00e676' }]}>{team?.name}</Text>
            </View>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{onlineCount} online</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: '🕐 Hora', value: profile?.totalGoals ?? 0 },
            { label: '🎲 Rodada', value: profile?.totalGoals ?? 0 },
            { label: '🏆 Temp.', value: profile?.totalGoals ?? 0 },
          ].map((s) => (
            <View key={s.label} style={styles.statPill}>
              <Text style={styles.statPillValue}>{s.value}</Text>
              <Text style={styles.statPillLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Área do chute */}
      <View style={styles.kickArea}>
        <Animated.Text style={[styles.ball, {
          transform: [{ translateY: ballTranslateY }, { scale: scaleAnim }, { translateX: shakeAnim }],
        }]}>
          ⚽
        </Animated.Text>

        {lastResult && (
          <Animated.Text style={[styles.result, {
            opacity: resultOpacity,
            color: lastResult.goal ? '#00e676' : '#ff5252',
          }]}>
            {lastResult.message}
          </Animated.Text>
        )}

        <View style={styles.kickTypeRow}>
          {KICK_TYPES.map((kt) => (
            <TouchableOpacity
              key={kt.id}
              style={[styles.kickTypeBtn, kickType === kt.id && styles.kickTypeBtnActive]}
              onPress={() => setKickType(kt.id as any)}
            >
              <Text style={[styles.kickTypeText, kickType === kt.id && { color: '#0a1628' }]}>
                {kt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.kickButton, !canKick && styles.kickButtonDisabled]}
          onPress={handleKick}
          disabled={!canKick || kicking}
          activeOpacity={0.8}
        >
          <Text style={styles.kickButtonText}>{canKick ? '🦵 CHUTAR' : '⏳ Recarregando'}</Text>
        </TouchableOpacity>

        {!canKick && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${progress * 100}%` as any }]} />
            </View>
            <Text style={styles.countdown}>{formatCountdown(countdown)}</Text>
          </View>
        )}
      </View>

      {/* Mini Ranking da Hora */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 Top Hora</Text>
        {topPlayers.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum gol ainda. Seja o primeiro! 🚀</Text>
        ) : (
          topPlayers.map((p, i) => {
            const t = TEAMS.find((tm) => tm.id === p.teamId);
            return (
              <View key={i} style={[styles.rankRow, i === topPlayers.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[styles.rankPos, { color: medalColors[i] }]}>{i + 1}º</Text>
                <Text style={styles.rankShield}>{t?.shield ?? '⚽'}</Text>
                <Text style={styles.rankNick}>{p.nick}</Text>
                <Text style={styles.rankGoals}>{p.goals} gols</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Feed de atividades */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Atividades recentes</Text>
        {activities.length === 0 ? (
          <Text style={styles.emptyText}>Sem atividades ainda.</Text>
        ) : (
          activities.map((a, i) => {
            const t = TEAMS.find((tm) => tm.id === a.teamId);
            return (
              <View key={a.id} style={[styles.activityRow, i === activities.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.activityShield}>{t?.shield ?? '⚽'}</Text>
                <Text style={styles.activityText}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{a.nick}</Text>
                  {a.goal
                    ? <Text style={{ color: '#00e676' }}> marcou um gol! ⚽</Text>
                    : <Text style={{ color: '#ff5252' }}> perdeu o chute ❌</Text>
                  }
                </Text>
                <Text style={styles.activityKick}>{a.kickType === 'penalti' ? '🥅' : '🌀'}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  playerCard: {
    backgroundColor: '#1a2a40', borderRadius: 16, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#2a3a50',
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarSmall: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#00e676',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarLetter: { fontSize: 20, fontWeight: 'bold', color: '#0a1628' },
  playerNick: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  teamEmoji: { fontSize: 14 },
  teamName: { fontSize: 13, fontWeight: '600' },
  onlineBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1f35',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
  },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00e676' },
  onlineText: { color: '#00e676', fontSize: 11, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 8 },
  statPill: { flex: 1, backgroundColor: '#0d1f35', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  statPillValue: { color: '#00e676', fontSize: 18, fontWeight: 'bold' },
  statPillLabel: { color: '#888', fontSize: 11, marginTop: 2 },

  kickArea: { alignItems: 'center', marginBottom: 16, minHeight: 260, justifyContent: 'center' },
  ball: { fontSize: 72, marginBottom: 8 },
  result: { fontSize: 26, fontWeight: 'bold', marginBottom: 12 },

  kickTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kickTypeBtn: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#2a3a50', backgroundColor: '#1a2a40',
  },
  kickTypeBtnActive: { backgroundColor: '#00e676', borderColor: '#00e676' },
  kickTypeText: { color: '#888', fontSize: 13, fontWeight: '600' },

  kickButton: {
    backgroundColor: '#00e676', paddingHorizontal: 48, paddingVertical: 18,
    borderRadius: 50, shadowColor: '#00e676', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8, marginBottom: 16,
  },
  kickButtonDisabled: { backgroundColor: '#1a3a28', shadowOpacity: 0, elevation: 0 },
  kickButtonText: { fontSize: 22, fontWeight: 'bold', color: '#0a1628' },

  progressContainer: { width: '80%', alignItems: 'center' },
  progressTrack: {
    width: '100%', height: 6, backgroundColor: '#1a2a40',
    borderRadius: 3, marginBottom: 8, overflow: 'hidden',
  },
  progressBar: { height: '100%', backgroundColor: '#00e676', borderRadius: 3 },
  countdown: { fontSize: 28, fontWeight: 'bold', color: '#ff9800', letterSpacing: 2 },

  section: {
    backgroundColor: '#1a2a40', borderRadius: 16, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: '#2a3a50',
  },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  emptyText: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#0d1f35',
  },
  rankPos: { fontSize: 15, fontWeight: 'bold', width: 32 },
  rankShield: { fontSize: 18, marginRight: 8 },
  rankNick: { flex: 1, color: '#fff', fontSize: 14 },
  rankGoals: { color: '#00e676', fontSize: 14, fontWeight: 'bold' },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#0d1f35', gap: 8,
  },
  activityShield: { fontSize: 16 },
  activityText: { flex: 1, fontSize: 13, color: '#aaa' },
  activityKick: { fontSize: 16 },
});
