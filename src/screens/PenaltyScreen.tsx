import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
  Line,
  Circle,
  Ellipse,
  Path,
  G,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ACTION_COOLDOWNS } from '../constants/teams';
import { getTimeRemaining, formatCountdown } from '../utils/gameLogic';
import { useAuth } from '../context/AuthContext';
import { kickAction, isCooldownError, PenaltyDirection } from '../services/game';
import { colors, font, radius, glow } from '../theme';

const { width } = Dimensions.get('window');

/* ---- Geometria da cena (proporcional à largura) ---- */
const SCENE_W = Math.min(width, 460);
const GOAL_W = SCENE_W * 0.8;
const GOAL_H = GOAL_W * 0.46;
const GOAL_TOP = 24; // topo do gol dentro da arena
const GOAL_X = (SCENE_W - GOAL_W) / 2;
const POST = 7; // espessura da trave
const TURF_H = SCENE_W * 0.62; // faixa de gramado abaixo do gol
const ARENA_H = GOAL_TOP + GOAL_H + TURF_H;
const SPOT_Y = GOAL_TOP + GOAL_H + TURF_H * 0.72; // marca do pênalti
const KEEPER_TRAVEL = GOAL_W * 0.3;
const BALL = 34;

type Direction = 'left' | 'center' | 'right';

const DIRS: { id: Direction; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; key: string }[] = [
  { id: 'left', icon: 'arrow-left-bold', label: 'ESQUERDA', key: '←' },
  { id: 'center', icon: 'arrow-up-bold', label: 'CENTRO', key: '↑' },
  { id: 'right', icon: 'arrow-right-bold', label: 'DIREITA', key: '→' },
];

/* Goleiro vetorial (kit rosa sob os holofotes) */
function Keeper() {
  return (
    <Svg width={58} height={66} viewBox="0 0 58 66">
      <G>
        {/* pernas */}
        <Rect x={22} y={44} width={6} height={18} rx={3} fill="#0B2138" />
        <Rect x={30} y={44} width={6} height={18} rx={3} fill="#0B2138" />
        {/* tronco */}
        <Path d="M18 26 Q29 20 40 26 L38 46 Q29 50 20 46 Z" fill={colors.red} />
        {/* braços abertos + luvas */}
        <Path d="M18 28 L5 34" stroke={colors.red} strokeWidth={6} strokeLinecap="round" />
        <Path d="M40 28 L53 34" stroke={colors.red} strokeWidth={6} strokeLinecap="round" />
        <Circle cx={4} cy={35} r={5} fill={colors.chalk} />
        <Circle cx={54} cy={35} r={5} fill={colors.chalk} />
        {/* cabeça */}
        <Circle cx={29} cy={14} r={8} fill="#E9B48C" />
      </G>
    </Svg>
  );
}

export default function PenaltyScreen({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<'choose' | 'animating' | 'result'>('choose');
  const [result, setResult] = useState<{ goal: boolean; playerDir: Direction; keeperDir: Direction } | null>(null);
  const [reloadMs, setReloadMs] = useState(0);
  const [kickedAt, setKickedAt] = useState<number | null>(null);
  const PENALTI_CD = ACTION_COOLDOWNS['penalti'];

  useEffect(() => {
    if (kickedAt === null) return;
    setReloadMs(getTimeRemaining(kickedAt, PENALTI_CD));
    const iv = setInterval(() => {
      const rem = getTimeRemaining(kickedAt, PENALTI_CD);
      setReloadMs(rem);
      if (rem === 0) clearInterval(iv);
    }, 500);
    return () => clearInterval(iv);
  }, [kickedAt]);

  const keeperX = useRef(new Animated.Value(0)).current;
  const keeperTilt = useRef(new Animated.Value(0)).current;
  const ballX = useRef(new Animated.Value(0)).current;
  const ballY = useRef(new Animated.Value(0)).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const resultOp = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  function dirToX(dir: Direction, travel: number) {
    return dir === 'left' ? -travel : dir === 'right' ? travel : 0;
  }

  const kick = useCallback(
    async (playerDir: Direction) => {
      if (phase !== 'choose') return;
      setPhase('animating');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      let keeperDir: Direction;
      let isGoal: boolean;
      try {
        const res = await kickAction('penalti', playerDir as PenaltyDirection);
        keeperDir = (res.keeperDir ?? 'center') as Direction;
        isGoal = res.goal;
      } catch (e) {
        setPhase('choose');
        if (isCooldownError(e)) {
          setKickedAt(profile?.lastPenaltiTime ?? Date.now());
          refreshProfile().catch(() => {});
        }
        return;
      }

      // alvo da bola: canto de cima do gol na direção escolhida
      const targetX = dirToX(playerDir, GOAL_W * 0.32);
      const targetY = -(TURF_H * 0.72 + GOAL_H * 0.35);

      Animated.parallel([
        Animated.timing(ballX, { toValue: targetX, duration: 420, useNativeDriver: true }),
        Animated.timing(ballY, { toValue: targetY, duration: 420, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 0.5, duration: 420, useNativeDriver: true }),
        Animated.timing(keeperX, { toValue: dirToX(keeperDir, KEEPER_TRAVEL), duration: 300, useNativeDriver: true }),
        Animated.timing(keeperTilt, {
          toValue: keeperDir === 'left' ? -1 : keeperDir === 'right' ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setKickedAt(Date.now());
        setResult({ goal: isGoal, playerDir, keeperDir });
        setPhase('result');
        Haptics.notificationAsync(
          isGoal ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        ).catch(() => {});
        Animated.timing(resultOp, { toValue: 1, duration: 260, useNativeDriver: true }).start();
        if (!isGoal) {
          Animated.sequence([
            Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
          ]).start();
        }
        refreshProfile().catch(() => {});
      });
    },
    [phase, profile]
  );

  /* Teclado no navegador (item 3.5): ← ↑ → chutam; Esc/Enter voltam */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'choose') {
        if (e.key === 'ArrowLeft') kick('left');
        else if (e.key === 'ArrowUp') kick('center');
        else if (e.key === 'ArrowRight') kick('right');
      } else if (phase === 'result' && (e.key === 'Enter' || e.key === 'Escape')) {
        navigation.goBack();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, kick]);

  const tilt = keeperTilt.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] });

  return (
    <SafeAreaView style={styles.container}>
      {/* céu */}
      <LinearGradient colors={[colors.night0, colors.night1]} style={StyleSheet.absoluteFill} />

      {/* header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <MaterialCommunityIcons name="close" size={20} color={colors.chalk} />
        </TouchableOpacity>
        <Text style={styles.title}>PÊNALTI</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* arena */}
      <View style={styles.arena}>
        {/* gramado */}
        <LinearGradient
          colors={[colors.turfDeep, '#12432F', colors.turfDeep]}
          locations={[0, 0.5, 1]}
          style={[styles.turf, { top: GOAL_TOP + GOAL_H * 0.62, height: TURF_H + GOAL_H * 0.4 }]}
        />

        {/* cena em SVG: holofote, perspectiva, arco, gol e rede */}
        <Svg width={SCENE_W} height={ARENA_H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="floodP" cx="50%" cy="8%" r="55%">
              <Stop offset="0" stopColor={colors.flood} stopOpacity={0.28} />
              <Stop offset="0.6" stopColor={colors.flood} stopOpacity={0.06} />
              <Stop offset="1" stopColor={colors.flood} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SCENE_W} height={ARENA_H} fill="url(#floodP)" />

          {/* linhas de perspectiva convergindo pro gol */}
          <Line x1={SCENE_W * 0.16} y1={ARENA_H} x2={GOAL_X} y2={GOAL_TOP + GOAL_H} stroke={colors.chalk} strokeWidth={1.5} strokeOpacity={0.08} />
          <Line x1={SCENE_W * 0.84} y1={ARENA_H} x2={GOAL_X + GOAL_W} y2={GOAL_TOP + GOAL_H} stroke={colors.chalk} strokeWidth={1.5} strokeOpacity={0.08} />
          {/* meia-lua + marca do pênalti */}
          <Ellipse cx={SCENE_W / 2} cy={SPOT_Y - 6} rx={GOAL_W * 0.34} ry={GOAL_H * 0.3} stroke={colors.chalk} strokeWidth={1.5} strokeOpacity={0.09} fill="none" />
          <Circle cx={SCENE_W / 2} cy={SPOT_Y} r={4} fill={colors.chalk} fillOpacity={0.5} />

          {/* rede */}
          <G opacity={0.9}>
            <Rect x={GOAL_X + POST} y={GOAL_TOP + POST} width={GOAL_W - POST * 2} height={GOAL_H - POST} fill={colors.night0} fillOpacity={0.35} />
            {Array.from({ length: 8 }).map((_, i) => (
              <Line
                key={`v${i}`}
                x1={GOAL_X + POST + ((GOAL_W - POST * 2) / 8) * i}
                y1={GOAL_TOP + POST}
                x2={GOAL_X + POST + ((GOAL_W - POST * 2) / 8) * i}
                y2={GOAL_TOP + GOAL_H}
                stroke={colors.chalk}
                strokeWidth={1}
                strokeOpacity={0.14}
              />
            ))}
            {Array.from({ length: 5 }).map((_, i) => (
              <Line
                key={`h${i}`}
                x1={GOAL_X + POST}
                y1={GOAL_TOP + POST + ((GOAL_H - POST) / 5) * i}
                x2={GOAL_X + GOAL_W - POST}
                y2={GOAL_TOP + POST + ((GOAL_H - POST) / 5) * i}
                stroke={colors.chalk}
                strokeWidth={1}
                strokeOpacity={0.14}
              />
            ))}
          </G>

          {/* trave (postes + travessão) */}
          <Rect x={GOAL_X} y={GOAL_TOP} width={POST} height={GOAL_H} rx={2} fill={colors.chalk} />
          <Rect x={GOAL_X + GOAL_W - POST} y={GOAL_TOP} width={POST} height={GOAL_H} rx={2} fill={colors.chalk} />
          <Rect x={GOAL_X} y={GOAL_TOP} width={GOAL_W} height={POST} rx={2} fill={colors.chalk} />
        </Svg>

        {/* goleiro na linha do gol */}
        <Animated.View
          style={[
            styles.keeper,
            { top: GOAL_TOP + GOAL_H - 54, transform: [{ translateX: keeperX }, { rotate: tilt }] },
          ]}
        >
          <Keeper />
        </Animated.View>

        {/* bola na marca do pênalti */}
        <Animated.Image
          source={require('../../assets/bola.png')}
          style={[
            styles.ball,
            { top: SPOT_Y - BALL, transform: [{ translateX: ballX }, { translateY: ballY }, { scale: ballScale }] },
          ]}
        />

        {/* flash na defesa */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.red, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }]} />
      </View>

      {/* controles */}
      <View style={styles.controls}>
        {phase === 'choose' && (
          <>
            <Text style={styles.hint}>Escolha o canto</Text>
            <View style={styles.dirRow}>
              {DIRS.map((d) => (
                <TouchableOpacity key={d.id} style={styles.dirBtn} onPress={() => kick(d.id)} activeOpacity={0.8}>
                  <View style={styles.dirIconBox}>
                    <MaterialCommunityIcons name={d.icon} size={30} color={colors.night0} />
                  </View>
                  <Text style={styles.dirLabel}>{d.label}</Text>
                  {Platform.OS === 'web' && <Text style={styles.dirKey}>{d.key}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {phase === 'animating' && <Text style={styles.shooting}>Chutando…</Text>}

        {phase === 'result' && result && (
          <Animated.View style={[styles.resultArea, { opacity: resultOp }]}>
            <Text style={[styles.resultText, { color: result.goal ? colors.turf : colors.red }]}>
              {result.goal ? 'É GOOOOL!' : 'DEFENDEU!'}
            </Text>
            <Text style={styles.resultSub}>
              {result.goal
                ? `No canto ${ptDir(result.playerDir)} — o goleiro foi pro outro lado`
                : `Você foi ${ptDir(result.playerDir)} e o goleiro pegou`}
            </Text>
            {reloadMs > 0 && (
              <View style={styles.cdChip}>
                <MaterialCommunityIcons name="timer-sand" size={14} color={colors.flood} />
                <Text style={styles.cdText}>{formatCountdown(reloadMs)}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>VOLTAR</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

function ptDir(d: Direction) {
  return d === 'left' ? 'esquerdo' : d === 'right' ? 'direito' : 'meio';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night0, alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', maxWidth: SCENE_W, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, zIndex: 10,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.chalk, fontFamily: font.poster, fontSize: 26, letterSpacing: 4 },

  arena: { width: SCENE_W, height: ARENA_H, position: 'relative' },
  turf: { position: 'absolute', left: 0, right: 0 },
  keeper: { position: 'absolute', left: SCENE_W / 2 - 29, alignItems: 'center' },
  ball: { position: 'absolute', left: SCENE_W / 2 - BALL / 2, width: BALL, height: BALL, zIndex: 5, ...glow(colors.chalk, 8) },

  controls: { flex: 1, width: '100%', maxWidth: SCENE_W, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 18 },
  hint: {
    color: colors.haze, fontFamily: font.bodyMed, fontSize: 12, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 14,
  },
  dirRow: { flexDirection: 'row', gap: 18, justifyContent: 'center' },
  dirBtn: { alignItems: 'center', gap: 7 },
  dirIconBox: {
    width: 74, height: 74, borderRadius: radius.md, backgroundColor: colors.turf,
    alignItems: 'center', justifyContent: 'center', ...glow(colors.turfGlow, 14),
  },
  dirLabel: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 1 },
  dirKey: { color: colors.hazeDim, fontFamily: font.body, fontSize: 12, marginTop: -2 },

  shooting: { color: colors.chalk, fontFamily: font.scoreMed, fontSize: 22, letterSpacing: 2, marginTop: 24 },

  resultArea: { alignItems: 'center', gap: 8 },
  resultText: {
    fontFamily: font.poster, fontSize: 44, letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  resultSub: { color: colors.haze, fontFamily: font.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  cdChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.panel,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 14, paddingVertical: 7, marginTop: 4,
  },
  cdText: { color: colors.flood, fontFamily: font.score, fontSize: 16, letterSpacing: 1 },
  backBtn: {
    marginTop: 12, paddingHorizontal: 42, paddingVertical: 13, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel,
  },
  backBtnText: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 14, letterSpacing: 1 },
});
