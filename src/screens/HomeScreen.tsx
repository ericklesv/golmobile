import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
import { subscribeTeamMatch, TeamMatchLive } from '../services/league';
import { cheer } from '../utils/narrator';
import { useToast } from '../components/Toast';
import {
  getTimeRemaining,
  formatCountdown,
  getCurrentHourKey,
  getCurrentRoundKey,
} from '../utils/gameLogic';
import NightBackground from '../components/NightBackground';
import Scoreboard from '../components/Scoreboard';
import KickTarget from '../components/KickTarget';
import TeamBadge from '../components/TeamBadge';
import { colors, font, radius, spacing, glow } from '../theme';

function haptic(type: 'success' | 'warning') {
  if (Platform.OS === 'web') return;
  try {
    Haptics.notificationAsync(
      type === 'success'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
  } catch {}
}

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

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const TARGETS: { id: ActionId; label: string; icon: IconName; color: string }[] = [
  { id: 'auto',    label: 'AUTO',    icon: 'lightning-bolt', color: colors.turf },
  { id: 'penalti', label: 'PÊNALTI', icon: 'soccer',         color: colors.flood },
  { id: 'falta',   label: 'FALTA',   icon: 'whistle',        color: '#38BDF8' },
  { id: 'trilha',  label: 'TRILHA',  icon: 'run-fast',       color: '#FF7A59' },
];

interface TopPlayer { nick: string; teamId: string; goals: number; }
interface Activity { id: string; nick: string; teamId: string; goal: boolean; kickType: string; ts: number; }

export default function HomeScreen({ navigation }: any) {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
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

  // O chute é decidido no servidor — aqui só animamos o resultado
  async function handleKick(type: ActionId = kickType) {
    const cd = cooldowns[type];
    if (!user || !profile || !cd?.canAct || kicking) return;
    if (type === 'penalti' || type === 'trilha') return; // têm telas próprias
    setKicking(true);
    try {
      const res = await kickAction(type);
      animateBall(res.goal);
      haptic(res.goal ? 'success' : 'warning');
      setLastResult({ goal: res.goal, message: cheer(res.goal) });
      await refreshProfile();
    } catch (e) {
      if (isCooldownError(e)) {
        await refreshProfile(); // ressincroniza o countdown com o servidor
      } else {
        toast('Sem conexão com o servidor. Tente de novo.', 'error');
      }
    } finally {
      setKicking(false);
    }
  }

  const ballTranslateY = ballAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -100] });
  const medalColors = [colors.flood, '#C7D0DB', '#D08A4B'];

  function pressTarget(id: ActionId) {
    setKickType(id);
    const cd = cooldowns[id];
    if (!cd?.canAct) return;
    if (id === 'penalti') setShowPenalty(true);
    else if (id === 'trilha') { setTrailKey((k) => k + 1); setShowTrail(true); }
    else handleKick(id);
  }

  const kickIcon = (id: string) =>
    id === 'penalti' ? 'soccer' : id === 'falta' ? 'whistle' : id === 'trilha' ? 'run-fast' : 'lightning-bolt';

  return (
    <NightBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Placar ao vivo da partida do time */}
        {match && (
          <Scoreboard
            myTeamId={profile!.teamId}
            myGoals={match.myGoals}
            oppTeamId={match.opponent}
            oppGoals={match.oppGoals}
            round={match.round}
            endsAt={match.endsAt}
          />
        )}

        {/* Identidade do jogador + online (toque abre Meu Time) */}
        <TouchableOpacity style={styles.identity} activeOpacity={0.8} onPress={() => navigation.navigate('Team')}>
          <TeamBadge teamId={profile?.teamId} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nick} numberOfLines={1}>{profile?.nick ?? '...'}</Text>
            <View style={styles.teamRow}>
              <Text style={styles.teamName} numberOfLines={1}>{team?.name ?? ''}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={colors.hazeDim} />
            </View>
          </View>
          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{onlineCount} em campo</Text>
          </View>
        </TouchableOpacity>

        {/* Meus gols por janela */}
        <View style={styles.statsRow}>
          {[
            { label: 'HORA', value: profile?.hourKey === getCurrentHourKey() ? profile?.hourGoals ?? 0 : 0 },
            { label: 'RODADA', value: profile?.roundKey === getCurrentRoundKey() ? profile?.roundGoals ?? 0 : 0 },
            { label: 'TEMPORADA', value: profile?.totalGoals ?? 0 },
          ].map((s) => (
            <View key={s.label} style={styles.statPill}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Zona de chute */}
        <View style={styles.kickCard}>
          <View style={styles.stage}>
            <Animated.Text style={[styles.ball, {
              transform: [{ translateY: ballTranslateY }, { scale: scaleAnim }, { translateX: shakeAnim }],
            }]}>
              ⚽
            </Animated.Text>
            {lastResult && (
              <Animated.Text style={[styles.result, {
                opacity: resultOpacity,
                color: lastResult.goal ? colors.turf : colors.red,
                textShadowColor: lastResult.goal ? colors.turfGlow : colors.redGlow,
              }]}>
                {lastResult.message}
              </Animated.Text>
            )}
          </View>

          <View style={styles.targetsRow}>
            {TARGETS.map((t) => {
              const cd = cooldowns[t.id];
              return (
                <KickTarget
                  key={t.id}
                  iconName={t.icon}
                  label={t.label}
                  color={t.color}
                  ready={cd.canAct}
                  progress={cd.progress}
                  countdown={formatCountdown(cd.remaining)}
                  active={kickType === t.id}
                  onPress={() => pressTarget(t.id)}
                  size={t.id === 'penalti' ? 70 : 64}
                />
              );
            })}
          </View>
        </View>

        {/* Top da hora */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <MaterialCommunityIcons name="trophy" size={16} color={colors.flood} />
            <Text style={styles.sectionTitle}>Artilheiros da hora</Text>
          </View>
          {topPlayers.length === 0 ? (
            <Text style={styles.emptyText}>Ninguém marcou ainda. Seja o primeiro a estufar a rede.</Text>
          ) : (
            topPlayers.map((p, i) => (
              <View key={i} style={[styles.rankRow, i === topPlayers.length - 1 && styles.noBorder]}>
                <Text style={[styles.rankPos, { color: medalColors[i] ?? colors.haze }]}>{i + 1}</Text>
                <TeamBadge teamId={p.teamId} size={26} />
                <Text style={styles.rankNick} numberOfLines={1}>{p.nick}</Text>
                <Text style={styles.rankGoals}>{p.goals}</Text>
                <Text style={styles.rankGoalsUnit}>gols</Text>
              </View>
            ))
          )}
        </View>

        {/* Feed de lances */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <MaterialCommunityIcons name="flash" size={16} color={colors.turf} />
            <Text style={styles.sectionTitle}>Lances ao vivo</Text>
          </View>
          {activities.length === 0 ? (
            <Text style={styles.emptyText}>O jogo está começando. Nenhum lance ainda.</Text>
          ) : (
            activities.map((a, i) => (
              <View key={a.id} style={[styles.activityRow, i === activities.length - 1 && styles.noBorder]}>
                <TeamBadge teamId={a.teamId} size={24} />
                <Text style={styles.activityText} numberOfLines={1}>
                  <Text style={styles.activityNick}>{a.nick}</Text>
                  {a.goal
                    ? <Text style={{ color: colors.turf }}> balançou as redes!</Text>
                    : <Text style={{ color: colors.red }}> parou no goleiro.</Text>}
                </Text>
                <MaterialCommunityIcons
                  name={kickIcon(a.kickType)}
                  size={15}
                  color={a.goal ? colors.turf : colors.hazeDim}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={showPenalty} animationType="slide" onRequestClose={() => setShowPenalty(false)}>
        <PenaltyScreen navigation={{ goBack: () => setShowPenalty(false) }} />
      </Modal>
      <Modal visible={showTrail} animationType="slide" onRequestClose={() => setShowTrail(false)}>
        <TrailScreen key={trailKey} navigation={{ goBack: () => setShowTrail(false) }} />
      </Modal>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 40 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  nick: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 16 },
  teamRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  teamName: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 12 },
  onlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.night0, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.line,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.turf },
  onlineText: { color: colors.turf, fontFamily: font.bodyMed, fontSize: 11 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statPill: {
    flex: 1, backgroundColor: colors.panel, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.line,
  },
  statValue: { color: colors.chalk, fontFamily: font.score, fontSize: 26, includeFontPadding: false },
  statLabel: { color: colors.haze, fontFamily: font.bodyBold, fontSize: 9, letterSpacing: 1, marginTop: 2 },

  kickCard: {
    backgroundColor: colors.panel, borderRadius: radius.lg, paddingVertical: spacing.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.line,
  },
  stage: { alignItems: 'center', justifyContent: 'center', height: 130 },
  ball: { fontSize: 60 },
  result: {
    position: 'absolute', top: 8,
    fontFamily: font.poster, fontSize: 40, letterSpacing: 1,
    textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 },
  },
  targetsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingHorizontal: spacing.sm },

  section: {
    backgroundColor: colors.panel, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  sectionTitle: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 14 },
  emptyText: { color: colors.hazeDim, fontFamily: font.body, fontSize: 13, textAlign: 'center', paddingVertical: spacing.sm, lineHeight: 19 },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  noBorder: { borderBottomWidth: 0 },
  rankPos: { fontFamily: font.score, fontSize: 18, width: 20, textAlign: 'center' },
  rankNick: { flex: 1, color: colors.chalk, fontFamily: font.bodyMed, fontSize: 14 },
  rankGoals: { color: colors.turf, fontFamily: font.score, fontSize: 18 },
  rankGoalsUnit: { color: colors.hazeDim, fontFamily: font.body, fontSize: 11 },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  activityText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.haze },
  activityNick: { color: colors.chalk, fontFamily: font.bodyBold },
});
