import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { ACTION_COOLDOWNS } from '../constants/teams';
import { getTimeRemaining, formatCountdown } from '../utils/gameLogic';
import { useAuth } from '../context/AuthContext';
import { kickAction, isCooldownError, PenaltyDirection } from '../services/game';

const { width } = Dimensions.get('window');
const GOAL_W = Math.min(width * 0.9, 420);
const GOAL_H = GOAL_W * 0.52;
const KEEPER_TRAVEL = GOAL_W * 0.27;
const BALL_TRAVEL_X = GOAL_W * 0.3;
const BALL_TRAVEL_Y = GOAL_H * 0.75;

const NET_ROWS = 5;
const NET_COLS = 9;

type Direction = 'left' | 'center' | 'right';

const DIRS: { id: Direction; arrow: string; label: string }[] = [
  { id: 'left',   arrow: '◄', label: 'ESQUERDA' },
  { id: 'center', arrow: '▲', label: 'CENTRO'   },
  { id: 'right',  arrow: '►', label: 'DIREITA'  },
];

export default function PenaltyScreen({ navigation }: any) {
  const { user, profile, refreshProfile } = useAuth();
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

  const keeperX   = useRef(new Animated.Value(0)).current;
  const ballX     = useRef(new Animated.Value(0)).current;
  const ballY     = useRef(new Animated.Value(0)).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const resultOp  = useRef(new Animated.Value(0)).current;

  function dirToX(dir: Direction, travel: number) {
    return dir === 'left' ? -travel : dir === 'right' ? travel : 0;
  }

  // O canto do goleiro e o resultado vêm do servidor; o cliente só anima
  async function kick(playerDir: Direction) {
    if (phase !== 'choose') return;
    setPhase('animating');

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

    Animated.parallel([
      Animated.timing(ballX,     { toValue: dirToX(playerDir, BALL_TRAVEL_X), duration: 380, useNativeDriver: true }),
      Animated.timing(ballY,     { toValue: -BALL_TRAVEL_Y,                   duration: 380, useNativeDriver: true }),
      Animated.timing(ballScale, { toValue: 0.45,                             duration: 380, useNativeDriver: true }),
      Animated.timing(keeperX,   { toValue: dirToX(keeperDir, KEEPER_TRAVEL), duration: 280, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(resultOp, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      setKickedAt(Date.now());
      setResult({ goal: isGoal, playerDir, keeperDir });
      setPhase('result');
      refreshProfile().catch(() => {});
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Grass stripes */}
      <View style={styles.grassBg} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.grassStripe, i % 2 === 0 && styles.grassStripeDark]} />
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>⚽  P Ê N A L T I</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Stadium arc */}
      <View style={styles.stadiumArc} />

      {/* Goal */}
      <View style={styles.goalWrapper}>
        {/* Left post */}
        <View style={styles.postLeft} />
        {/* Right post */}
        <View style={styles.postRight} />
        {/* Crossbar */}
        <View style={styles.crossbar} />

        {/* Net grid */}
        <View style={styles.net}>
          {Array.from({ length: NET_ROWS }).map((_, r) => (
            <View key={r} style={styles.netRow}>
              {Array.from({ length: NET_COLS }).map((_, c) => (
                <View key={c} style={styles.netCell} />
              ))}
            </View>
          ))}
        </View>

        {/* Goalkeeper */}
        <Animated.View style={[styles.keeperWrap, { transform: [{ translateX: keeperX }] }]}>
          <Text style={styles.keeperHead}>😤</Text>
          <View style={styles.keeperBody}>
            <Text style={styles.keeperBodyText}>🟧</Text>
          </View>
          <View style={styles.keeperArms}>
            <Text style={styles.keeperArmText}>🤚</Text>
            <Text style={[styles.keeperArmText, { transform: [{ scaleX: -1 }] }]}>🤚</Text>
          </View>
        </Animated.View>
      </View>

      {/* Field between goal and ball */}
      <View style={styles.fieldMid} />

      {/* Ball */}
      <Animated.Text style={[styles.ball, {
        transform: [{ translateX: ballX }, { translateY: ballY }, { scale: ballScale }],
      }]}>
        ⚽
      </Animated.Text>

      {/* Penalty spot */}
      <View style={styles.penaltySpot} />

      {/* Direction buttons */}
      {phase === 'choose' && (
        <>
          <Text style={styles.hint}>Escolha onde chutar</Text>
          <View style={styles.dirRow}>
            {DIRS.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.dirBtn}
                onPress={() => kick(d.id)}
                activeOpacity={0.7}
              >
                <View style={styles.dirArrowBox}>
                  <Text style={styles.dirArrowText}>{d.arrow}</Text>
                </View>
                <Text style={styles.dirLabel}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {phase === 'animating' && (
        <Text style={styles.shootingText}>💨  Chutando...</Text>
      )}

      {phase === 'result' && (
        <Animated.View style={[styles.resultArea, { opacity: result ? resultOp : 1 }]}>
          {result ? (
            <>
              <Text style={[styles.resultText, { color: result.goal ? '#00e676' : '#ff5252' }]}>
                {result.goal ? '⚽  GOOOOOL!' : '🧤  DEFENDIDO!'}
              </Text>
              <Text style={styles.resultSub}>
                {result.goal
                  ? `Você chutou ${ptDir(result.playerDir)} — goleiro foi ${ptDir(result.keeperDir)}`
                  : `Você chutou ${ptDir(result.playerDir)} — goleiro adivinhou!`}
              </Text>
            </>
          ) : null}

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>↩  VOLTAR</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function ptDir(d: Direction) {
  return d === 'left' ? 'esquerda' : d === 'right' ? 'direita' : 'o centro';
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#1b5e20', alignItems: 'center',
  },

  /* Grass */
  grassBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'column',
  },
  grassStripe: { flex: 1, backgroundColor: '#2e7d32' },
  grassStripeDark: { backgroundColor: '#1b5e20' },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    zIndex: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  title: {
    color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 3,
    textShadowColor: '#000', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 6,
  },

  /* Stadium arc */
  stadiumArc: {
    width: GOAL_W * 1.4, height: 40, borderRadius: 100,
    backgroundColor: '#388e3c', marginBottom: -20, zIndex: 1,
  },

  /* Goal */
  goalWrapper: {
    width: GOAL_W, height: GOAL_H, position: 'relative',
    alignItems: 'center', justifyContent: 'flex-start',
    zIndex: 2,
  },
  postLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 8, backgroundColor: '#fff',
    shadowColor: '#fff', shadowOpacity: 0.6, shadowRadius: 4,
  },
  postRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 8, backgroundColor: '#fff',
    shadowColor: '#fff', shadowOpacity: 0.6, shadowRadius: 4,
  },
  crossbar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 8, backgroundColor: '#fff',
    shadowColor: '#fff', shadowOpacity: 0.6, shadowRadius: 4,
  },
  net: {
    position: 'absolute', top: 8, left: 8, right: 8, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  netRow: {
    flexDirection: 'row', flex: 1,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  netCell: {
    flex: 1,
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.18)',
  },

  /* Goalkeeper */
  keeperWrap: {
    position: 'absolute', bottom: 4,
    alignItems: 'center', alignSelf: 'center',
  },
  keeperHead: { fontSize: 26, lineHeight: 30 },
  keeperBody: { alignItems: 'center', marginTop: -4 },
  keeperBodyText: { fontSize: 20 },
  keeperArms: {
    flexDirection: 'row', gap: 24, marginTop: -8,
  },
  keeperArmText: { fontSize: 14 },

  /* Field */
  fieldMid: { width: GOAL_W * 1.1, height: 24, backgroundColor: '#2e7d32' },

  /* Ball */
  ball: { fontSize: 44, zIndex: 5 },

  /* Penalty spot */
  penaltySpot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)', marginTop: 8,
  },

  /* Direction buttons */
  hint: {
    color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600',
    letterSpacing: 1, marginTop: 20, marginBottom: 12,
    textTransform: 'uppercase',
  },
  dirRow: {
    flexDirection: 'row', gap: 20, justifyContent: 'center', paddingHorizontal: 20,
  },
  dirBtn: { alignItems: 'center', gap: 8 },
  dirArrowBox: {
    width: 72, height: 72, borderRadius: 12,
    backgroundColor: '#00a844',
    borderWidth: 2, borderColor: '#00e676',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#00ff88', shadowOpacity: 0.7, shadowRadius: 12, elevation: 8,
  },
  dirArrowText: { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  dirLabel: {
    color: '#b9f6ca', fontSize: 10, fontWeight: '800', letterSpacing: 1,
  },

  /* Shooting text */
  shootingText: {
    color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 32,
    letterSpacing: 2,
  },

  /* Result */
  resultArea: { alignItems: 'center', gap: 10, marginTop: 24, paddingHorizontal: 20 },
  resultText: {
    fontSize: 34, fontWeight: 'bold', letterSpacing: 2,
    textShadowColor: '#000', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 8,
  },
  resultSub: {
    color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center', marginBottom: 8,
  },
  backBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 36, paddingVertical: 14,
    borderRadius: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  retryBtn: {
    backgroundColor: '#00e676', paddingHorizontal: 36, paddingVertical: 14,
    borderRadius: 40, elevation: 6,
    shadowColor: '#00e676', shadowOpacity: 0.5, shadowRadius: 10,
  },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },

  clockCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16,
    paddingHorizontal: 24, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 4,
  },
  clockIcon: { fontSize: 32 },
  clockLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  clockTime: { color: '#ff9800', fontSize: 30, fontWeight: 'bold', letterSpacing: 3, marginTop: 2 },
});
