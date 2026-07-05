import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import PenaltyScreen from './PenaltyScreen';
import TrailScreen from './TrailScreen';
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { TEAMS, ACTION_COOLDOWNS, ACTION_LAST_TIME_FIELD } from '../constants/teams';
import { kickAction, isCooldownError } from '../services/game';
import { subscribeTeamMatch, formatMatchTimeLeft, TeamMatchLive } from '../services/league';
import {
  getTimeRemaining,
  formatCountdown,
  getCurrentHourKey,
  getCurrentRoundKey,
} from '../utils/gameLogic';

// Todos os tipos de ação incluindo AUTO
const ALL_ACTION_IDS = ['auto', 'penalti', 'falta', 'trilha'] as const;
type ActionId = typeof ALL_ACTION_IDS[number];

type CooldownMap = Record<ActionId, { remaining: number; canAct: boolean; progress: number }>;

function buildCooldownMap(profile: any): CooldownMap {
  const result = {} as CooldownMap;
  for (const id of ALL_ACTION_IDS) {
    const field = ACTION_LAST_TIME_FIELD[id];
    const lastTime = profile?.[field] ?? 0;
    const cdMs = ACTION_COOLDOWNS[id];
    const remaining = getTimeRemaining(lastTime, cdMs);
    result[id] = {
      remaining,
      canAct: remaining === 0,
      progress: remaining === 0 ? 1 : 1 - remaining / cdMs,
    };
  }
  return result;
}

const KICK_TYPES = [
  { id: 'penalti' as ActionId, label: 'PÊNALTI', emoji: '⚽', color: '#FFD700', glow: '#FFD70066' },
  { id: 'falta'   as ActionId, label: 'FALTA',   emoji: '🌀', color: '#00bcd4', glow: '#00bcd466' },
  { id: 'trilha'  as ActionId, label: 'TRILHA',  emoji: '🟠', color: '#FF7043', glow: '#FF704366' },
];

interface TopPlayer { nick: string; teamId: string; goals: number; }
interface Activity { id: string; nick: string; teamId: string; goal: boolean; kickType: string; ts: number; }

export default function HomeScreen({ navigation }: any) {
  const { user, profile, refreshProfile } = useAuth();
  const [cooldowns, setCooldowns] = useState<CooldownMap>(() => buildCooldownMap(null));
  const [lastResult, setLastResult] = useState<null | { goal: boolean; message: string }>(null);
  const [kicking, setKicking] = useState(false);
  const [kickType, setKickType] = useState<ActionId>('penalti');
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [showPenalty, setShowPenalty] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const [trailKey, setTrailKey] = useState(0);
  const [match, setMatch] = useState<TeamMatchLive | null>(null);
  const [, forceTick] = useState(0);

  // Placar ao vivo da partida do meu time
  useEffect(() => {
    if (!profile?.teamId) return;
    const unsub = subscribeTeamMatch(profile.teamId, setMatch);
    return unsub;
  }, [profile?.teamId]);

  // Atualiza o "termina em ..." de minuto em minuto
  useEffect(() => {
    const iv = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Ao fechar os modais, re-lê o perfil para atualizar cooldowns
  useEffect(() => {
    if (!showPenalty && !showTrail) refreshProfile();
  }, [showPenalty, showTrail]);

  // Ticker único que atualiza todos os cooldowns de 500ms em 500ms
  useEffect(() => {
    const iv = setInterval(() => {
      setCooldowns(buildCooldownMap(profile));
    }, 500);
    return () => clearInterval(iv);
  }, [profile]);

  const ballAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  const team = TEAMS.find((t) => t.id === profile?.teamId);

  // Auto-disparo quando a ação selecionada fica disponível
  const autoKickRef = useRef(false);
  useEffect(() => {
    const cd = cooldowns[kickType];
    if (cd?.canAct && !kicking && !autoKickRef.current) {
      autoKickRef.current = true;
      const timer = setTimeout(() => {
        if (kickType === 'penalti') {
          setShowPenalty(true);
        } else {
          handleKick();
        }
        autoKickRef.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
    if (!cd?.canAct) autoKickRef.current = false;
  }, [cooldowns, kicking, kickType]);

  useEffect(() => {
    async function fetchTop() {
      try {
        const q = query(
          collection(db, 'rankings', 'hour', 'entries'),
          where('hourKey', '==', getCurrentHourKey()),
          orderBy('goals', 'desc'),
          limit(3)
        );
        const snap = await getDocs(q);
        setTopPlayers(snap.docs.map((d) => d.data() as TopPlayer));
      } catch {}
    }
    fetchTop();
  }, [lastResult]);

  // Presença online: heartbeat próprio + contagem de quem deu sinal nos últimos 2 min
  useEffect(() => {
    if (!user) return;
    const beat = () =>
      setDoc(doc(db, 'presence', user.uid), { lastSeen: Date.now(), nick: profile?.nick ?? '' }).catch(() => {});
    beat();
    const iv = setInterval(beat, 60_000);
    return () => clearInterval(iv);
  }, [user?.uid]);

  useEffect(() => {
    async function countOnline() {
      try {
        const q = query(collection(db, 'presence'), where('lastSeen', '>', Date.now() - 120_000));
        const snap = await getCountFromServer(q);
        setOnlineCount(Math.max(1, snap.data().count));
      } catch {}
    }
    countOnline();
    const iv = setInterval(countOnline, 30_000);
    return () => clearInterval(iv);
  }, []);

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

  // O chute é decidido no servidor (Cloud Function `kick`) — aqui só animamos
  async function handleKick() {
    const cd = cooldowns[kickType];
    if (!user || !profile || !cd?.canAct || kicking) return;
    if (kickType === 'penalti' || kickType === 'trilha') return; // têm telas próprias
    setKicking(true);
    try {
      const res = await kickAction(kickType);
      animateBall(res.goal);
      setLastResult(res.goal ? { goal: true, message: '⚽ GOOOOOL!' } : { goal: false, message: '❌ Defendido!' });
      await refreshProfile();
    } catch (e) {
      if (isCooldownError(e)) {
        await refreshProfile(); // ressincroniza o countdown com o servidor
      } else {
        Alert.alert('Erro', 'Sem conexão com o servidor. Tente novamente.');
      }
    } finally {
      setKicking(false);
    }
  }

  const ballTranslateY = ballAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -100] });
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Placar ao vivo da partida do time */}
      {match && (() => {
        const opp = TEAMS.find((t) => t.id === match.opponent);
        const win = match.myGoals > match.oppGoals;
        const draw = match.myGoals === match.oppGoals;
        return (
          <View style={styles.matchCard}>
            <View style={styles.matchHeaderRow}>
              <View style={styles.liveDot} />
              <Text style={styles.matchHeaderText}>
                RODADA {match.round} · {formatMatchTimeLeft(match.endsAt)}
              </Text>
            </View>
            <View style={styles.matchScoreRow}>
              <View style={styles.matchTeam}>
                <Text style={styles.matchShield}>{team?.shield ?? '⚽'}</Text>
                <Text style={styles.matchTeamName} numberOfLines={1}>{team?.name ?? 'Meu time'}</Text>
              </View>
              <View style={styles.matchScoreBox}>
                <Text style={[styles.matchScore, { color: win ? '#00e676' : draw ? '#ffb300' : '#fff' }]}>
                  {match.myGoals}
                </Text>
                <Text style={styles.matchScoreX}>x</Text>
                <Text style={styles.matchScore}>{match.oppGoals}</Text>
              </View>
              <View style={styles.matchTeam}>
                <Text style={styles.matchShield}>{opp?.shield ?? '⚽'}</Text>
                <Text style={styles.matchTeamName} numberOfLines={1}>{opp?.name ?? 'Adversário'}</Text>
              </View>
            </View>
            <Text style={styles.matchTip}>
              {win ? '🔥 Seu time está na frente! Faça mais gols.'
                : draw ? '⚖️ Empate! Cada gol seu conta.'
                : '⚠️ Seu time está perdendo. Bora virar!'}
            </Text>
          </View>
        );
      })()}

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
            { label: '🕐 Hora', value: profile?.hourKey === getCurrentHourKey() ? profile?.hourGoals ?? 0 : 0 },
            { label: '🎲 Rodada', value: profile?.roundKey === getCurrentRoundKey() ? profile?.roundGoals ?? 0 : 0 },
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
          {/* Botão AUTO */}
          {(() => {
            const cd = cooldowns['auto'];
            return (
              <TouchableOpacity
                style={styles.kickTypeBtnWrap}
                onPress={() => { setKickType('auto'); if (cd.canAct) handleKick(); }}
                disabled={kickType === 'auto' && (!cd.canAct || kicking)}
                activeOpacity={0.75}
              >
                <View style={[
                  styles.kickTypeBall, styles.kickMainBall,
                  cd.canAct
                    ? { borderColor: '#00e676', shadowColor: '#00e67699', shadowOpacity: 1, shadowRadius: 16, elevation: 12 }
                    : { borderColor: '#2a3a50' },
                ]}>
                  {cd.canAct
                    ? <Text style={styles.kickTypeBallEmoji}>🦵</Text>
                    : <Text style={styles.kickCountdownText}>{formatCountdown(cd.remaining)}</Text>
                  }
                </View>
                <View style={styles.kickTypeLabelRow}>
                  <View style={[styles.kickTypeDot, { backgroundColor: cd.canAct ? '#00e676' : '#ff9800' }]} />
                  <Text style={[styles.kickTypeLabel, { color: cd.canAct ? '#00e676' : '#ff9800' }]}>AUTO</Text>
                </View>
              </TouchableOpacity>
            );
          })()}

          {KICK_TYPES.map((kt) => {
            const cd = cooldowns[kt.id];
            const active = kickType === kt.id;
            return (
              <TouchableOpacity
                key={kt.id}
                style={styles.kickTypeBtnWrap}
                onPress={() => {
                  setKickType(kt.id);
                  if (kt.id === 'penalti' && cd.canAct) setShowPenalty(true);
                  else if (kt.id === 'trilha' && cd.canAct) { setTrailKey(k => k + 1); setShowTrail(true); }
                }}
                activeOpacity={0.75}
              >
                <View style={[
                  styles.kickTypeBall,
                  active && { borderColor: kt.color, shadowColor: kt.glow, shadowOpacity: 1, shadowRadius: 12, elevation: 10 },
                  !active && { borderColor: '#2a3a50' },
                ]}>
                  {cd.canAct
                    ? <Text style={styles.kickTypeBallEmoji}>{kt.emoji}</Text>
                    : <Text style={styles.kickCountdownText}>{formatCountdown(cd.remaining)}</Text>
                  }
                </View>
                <View style={styles.kickTypeLabelRow}>
                  <View style={[styles.kickTypeDot, { backgroundColor: cd.canAct ? kt.color : '#2a3a50' }]} />
                  <Text style={[styles.kickTypeLabel, { color: cd.canAct ? kt.color : '#556' }]}>
                    {kt.id === 'penalti' && cd.canAct ? '▶ JOGAR' : kt.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Barra de progresso da ação selecionada */}
        {!cooldowns[kickType]?.canAct && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${cooldowns[kickType]?.progress * 100}%` as any }]} />
            </View>
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

    <Modal
      visible={showPenalty}
      animationType="slide"
      onRequestClose={() => setShowPenalty(false)}
    >
      <PenaltyScreen navigation={{ goBack: () => setShowPenalty(false) }} />
    </Modal>

    <Modal
      visible={showTrail}
      animationType="slide"
      onRequestClose={() => setShowTrail(false)}
    >
      <TrailScreen key={trailKey} navigation={{ goBack: () => setShowTrail(false) }} />
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  matchCard: {
    backgroundColor: '#12233c', borderRadius: 16, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#00e67640',
  },
  matchHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ff4444' },
  matchHeaderText: { color: '#8fa3bf', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  matchScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchTeam: { flex: 1, alignItems: 'center', gap: 3 },
  matchShield: { fontSize: 26 },
  matchTeamName: { color: '#cdd8e8', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  matchScoreBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  matchScore: { color: '#fff', fontSize: 34, fontWeight: '900', minWidth: 30, textAlign: 'center' },
  matchScoreX: { color: '#556', fontSize: 16, fontWeight: '700' },
  matchTip: { color: '#8fa3bf', fontSize: 12, textAlign: 'center', marginTop: 10 },

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

  kickTypeRow: {
    flexDirection: 'row', gap: 14, marginBottom: 20,
    justifyContent: 'center',
  },
  kickTypeBtnWrap: { alignItems: 'center', gap: 6 },
  kickTypeBall: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#0d1f35', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0,
  },
  kickMainBall: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#0d2a1e',
  },
  kickTypeBallEmoji: { fontSize: 28 },
  kickCountdownText: { color: '#ff9800', fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5 },
  kickTypeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kickTypeDot: { width: 6, height: 6, borderRadius: 3 },
  kickTypeLabel: { color: '#667', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  progressContainer: { width: '80%', alignItems: 'center', marginTop: -10, marginBottom: 12 },
  progressTrack: {
    width: '100%', height: 6, backgroundColor: '#1a2a40',
    borderRadius: 3, marginBottom: 8, overflow: 'hidden',
  },
  progressBar: { height: '100%', backgroundColor: '#00e676', borderRadius: 3 },

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
