import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, SafeAreaView, Dimensions, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ACTION_COOLDOWNS } from '../constants/teams';
import { getTimeRemaining, formatCountdown } from '../utils/gameLogic';
import { trailPickAction, isCooldownError } from '../services/game';
import { colors, font, radius } from '../theme';

const { width: SW } = Dimensions.get('window');
// Image trilha.png is 1024x1536 (2:3). Display at screen width.
const FW = Math.min(SW, 420);
const FH = FW * 1.5;
const PS = 46;
const HP = PS / 2;
const BS = 14;   // ball diameter
const BH = BS / 2;
const TRAIL = 4; // ecos de motion blur atrás da bola
// Goalkeeper position (bottom goal, center)
const GK_X = FW * 0.500;
const GK_Y = FH * 0.880;
// Opponent goal (top net center)
const GOAL_X = FW * 0.500;
const GOAL_Y = FH * 0.055;

const TRAIL_CD = ACTION_COOLDOWNS['trilha'];

// Player positions as [xFraction, yFraction] of image (1024x1536)
const LINES = [
  {
    id: 'defense' as const, label: 'DEFESA', color: colors.turf, total: 4, safe: 3,
    players: [[0.215, 0.710], [0.396, 0.710], [0.605, 0.710], [0.782, 0.710]] as [number, number][],
  },
  {
    id: 'midfield' as const, label: 'MEIO CAMPO', color: colors.flood, total: 3, safe: 2,
    players: [[0.268, 0.490], [0.497, 0.490], [0.725, 0.490]] as [number, number][],
  },
  {
    id: 'attack' as const, label: 'ATAQUE', color: colors.red, total: 3, safe: 1,
    players: [[0.225, 0.298], [0.497, 0.308], [0.768, 0.298]] as [number, number][],
  },
];

type PState = { mine: boolean; revealed: boolean; picked: boolean };

// As minas ficam no servidor (users/{uid}/private/trail) — aqui só o estado visual
function freshStates(): PState[][] {
  return LINES.map(l =>
    Array.from({ length: l.total }, () => ({ mine: false, revealed: false, picked: false }))
  );
}

export default function TrailScreen({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const startPhase = Math.min(profile?.trailPosition ?? 0, LINES.length - 1);
  const [phase, setPhase] = useState(startPhase);
  const [states, setStates] = useState<PState[][]>(freshStates);
  const [gameOver, setGameOver] = useState<null | 'fail' | 'goal'>(null);
  const [busy, setBusy] = useState(false);
  const [reloadMs, setReloadMs] = useState(0);
  const [kickedAt, setKickedAt] = useState<number | null>(null);
  const ovOpacity = useRef(new Animated.Value(0)).current;
  const ovTransY = useRef(new Animated.Value(60)).current;
  // Ball animation
  const ballX = useRef(new Animated.Value(GK_X)).current;
  const ballY = useRef(new Animated.Value(GK_Y)).current;
  // Ecos do rastro (motion blur)
  const trail = useRef(
    Array.from({ length: TRAIL }, () => ({ x: new Animated.Value(GK_X), y: new Animated.Value(GK_Y) }))
  ).current;

  useEffect(() => {
    const base = kickedAt ?? (profile?.lastTrilhaTime ?? 0);
    const rem = getTimeRemaining(base, TRAIL_CD);
    setReloadMs(rem);
    if (rem === 0) return;
    const iv = setInterval(() => {
      const r = getTimeRemaining(base, TRAIL_CD);
      setReloadMs(r);
      if (r === 0) clearInterval(iv);
    }, 500);
    return () => clearInterval(iv);
  }, [kickedAt]);

  function showOverlay() {
    ovOpacity.setValue(0); ovTransY.setValue(60);
    Animated.parallel([
      Animated.timing(ovOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(ovTransY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 10 }),
    ]).start();
  }

  function moveBall(toX: number, toY: number, dur = 420, cb?: () => void) {
    Animated.parallel([
      Animated.timing(ballX, { toValue: toX, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(ballY, { toValue: toY, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start(cb ? ({ finished }) => { if (finished) cb(); } : undefined);
    // ecos seguem com atraso crescente = rastro
    trail.forEach((t, i) => {
      Animated.parallel([
        Animated.timing(t.x, { toValue: toX, duration: dur, delay: (i + 1) * 45, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t.y, { toValue: toY, duration: dur, delay: (i + 1) * 45, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }

  // Cada palpite é validado no servidor (Cloud Function `trailPick`)
  async function pick(li: number, pi: number) {
    if (busy || gameOver !== null || phase !== li) return;
    if (li === 0 && reloadMs > 0) return;
    if (states[li][pi].revealed) return;
    setBusy(true);

    let res;
    try {
      res = await trailPickAction(pi);
    } catch (e) {
      setBusy(false);
      if (isCooldownError(e)) {
        setKickedAt(profile?.lastTrilhaTime ?? Date.now());
        refreshProfile().catch(() => {});
      }
      return;
    }

    const [xf, yf] = LINES[li].players[pi];
    moveBall(FW * xf, FH * yf, 420);
    if (res.finished) setKickedAt(res.kickedAt ?? Date.now());

    setTimeout(() => {
      setStates(prev =>
        prev.map((line, idx) =>
          idx !== li
            ? line
            : line.map((_, i) => ({ mine: res.lineMines[i], revealed: true, picked: i === pi }))
        )
      );
      refreshProfile().catch(() => {});
      if (res.mine) {
        setTimeout(() => { setGameOver('fail'); showOverlay(); setBusy(false); }, 300);
      } else if (res.goal) {
        moveBall(GOAL_X, GOAL_Y, 500);
        setTimeout(() => { setGameOver('goal'); showOverlay(); setBusy(false); }, 600);
      } else {
        setTimeout(() => { setPhase(res.phase); setBusy(false); }, 180);
      }
    }, 430);
  }

  const inCooldown = phase === 0 && reloadMs > 0 && gameOver === null;
  const activeLine = LINES[Math.min(phase, LINES.length - 1)];

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.xBtn}>
          <MaterialCommunityIcons name="close" size={18} color={colors.chalk} />
        </TouchableOpacity>
        <View style={s.titleRow}>
          <MaterialCommunityIcons name="run-fast" size={22} color={colors.flood} />
          <Text style={s.title}>TRILHA</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <View style={s.crumbs}>
        {LINES.map((l, i) => (
          <React.Fragment key={l.id}>
            <View style={[
              s.crumb,
              phase > i && s.crumbDone,
              phase === i && gameOver === null && { backgroundColor: l.color + '24', borderColor: l.color },
            ]}>
              <Text style={[s.crumbTxt, phase === i && gameOver === null && { color: l.color }]}>
                {l.label}
              </Text>
            </View>
            <View style={[s.crLine, phase > i && { backgroundColor: colors.turf }]} />
          </React.Fragment>
        ))}
        <View style={[s.crumb, gameOver === 'goal' && { backgroundColor: colors.flood + '24', borderColor: colors.flood }]}>
          <Text style={[s.crumbTxt, gameOver === 'goal' && { color: colors.flood }]}>GOL</Text>
        </View>
      </View>

      <View style={[s.field, { width: FW, height: FH }]}>
        <Image source={require('../../assets/trilha.png')} style={s.fieldImg} resizeMode="cover" />

        {/* Rastro (ecos atrás da bola) */}
        {trail.map((t, i) => (
          <Animated.Image
            key={i}
            source={require('../../assets/bola.png')}
            style={[
              s.ball,
              {
                opacity: 0.32 - i * 0.06,
                transform: [
                  { translateX: t.x }, { translateY: t.y },
                  { scale: 1 - (i + 1) * 0.12 },
                ],
              },
            ]}
          />
        ))}

        {/* Bola */}
        <Animated.Image
          source={require('../../assets/bola.png')}
          style={[s.ball, s.ballMain, { transform: [{ translateX: ballX }, { translateY: ballY }] }]}
        />

        {gameOver === null && !inCooldown && (
          <View
            pointerEvents="none"
            style={[
              s.zoneGlow,
              {
                top: FH * activeLine.players[0][1] - FH * 0.10,
                height: FH * 0.20,
                borderColor: activeLine.color + '80',
              },
            ]}
          />
        )}

        {LINES.map((line, li) =>
          states[li].map((p, pi) => {
            const [xf, yf] = line.players[pi];
            const px = FW * xf - HP;
            const py = FH * yf - HP;
            const isActive = phase === li && gameOver === null && !inCooldown && !p.revealed;
            const isPast = phase > li;
            let bg = 'transparent', bc = 'transparent', label = '';
            let tColor: string = colors.chalk, glowColor: string = colors.chalk;
            let disabled = true, showGlow = false;

            if (p.revealed) {
              if (!p.mine) {
                bg = colors.turf + 'C0'; bc = colors.turf; label = '✓'; tColor = colors.night0;
                if (p.picked) { showGlow = true; glowColor = colors.turf; }
              } else {
                bg = colors.red + 'CC'; bc = colors.red; label = '✗'; tColor = colors.chalk;
                if (p.picked) { showGlow = true; glowColor = colors.red; }
              }
            } else if (isPast) {
              bg = colors.turf + '99'; bc = colors.turf; label = '✓'; tColor = colors.night0;
            } else if (isActive) {
              bg = line.color + '55'; bc = line.color;
              label = String(pi + 1); tColor = colors.chalk;
              disabled = false; showGlow = true; glowColor = line.color;
            }

            return (
              <TouchableOpacity
                key={`${li}-${pi}`}
                style={[s.playerAbs, { left: px, top: py }]}
                onPress={() => pick(li, pi)}
                disabled={disabled}
                activeOpacity={0.6}
              >
                <View style={[
                  s.pCircle,
                  { backgroundColor: bg, borderColor: bc, borderWidth: bc === 'transparent' ? 0 : 2.5 },
                  showGlow && { shadowColor: glowColor, shadowOpacity: 0.95, shadowRadius: 16, elevation: 12 },
                ]}>
                  {label !== '' && <Text style={[s.pIcon, { color: tColor }]}>{label}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {inCooldown && (
          <View style={s.cdOverlay}>
            <View style={s.cdBox}>
              <MaterialCommunityIcons name="timer-sand" size={22} color={colors.flood} />
              <Text style={s.cdTitle}>EM RECARGA</Text>
              <Text style={s.cdTimer}>{formatCountdown(reloadMs)}</Text>
            </View>
          </View>
        )}
      </View>

      {gameOver === null && !inCooldown && (
        <Text style={[s.hint, { color: activeLine.color }]}>{activeLine.label}  {'—'}  escolha um jogador</Text>
      )}

      <View style={{ flex: 1 }} />

      {gameOver !== null && (
        <Animated.View style={[s.overlay, { opacity: ovOpacity, transform: [{ translateY: ovTransY }] }]}>
          {gameOver === 'fail' ? (
            <>
              <MaterialCommunityIcons name="shoe-cleat" size={34} color={colors.red} style={{ transform: [{ rotate: '-20deg' }] }} />
              <Text style={[s.ovTitle, { color: colors.red }]}>VOCÊ FOI DESARMADO!</Text>
              <Text style={s.ovSub}>Aguarde para tentar novamente.</Text>
              {reloadMs > 0 && <Text style={s.ovTimer}>{formatCountdown(reloadMs)}</Text>}
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="trophy" size={36} color={colors.flood} />
              <Text style={[s.ovTitle, { color: colors.flood }]}>TRILHA COMPLETA!</Text>
              <Text style={s.ovSub}>Gol registrado! Aguarde para jogar novamente.</Text>
              {reloadMs > 0 && <Text style={s.ovTimer}>{formatCountdown(reloadMs)}</Text>}
            </>
          )}
          <TouchableOpacity style={s.ovBack} onPress={() => navigation.goBack()}>
            <Text style={s.ovBackTxt}>VOLTAR</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {gameOver === null && (
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnTxt}>VOLTAR</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night0, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: FW, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  xBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.chalk, fontFamily: font.poster, fontSize: 24, letterSpacing: 4 },
  crumbs: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  crumb: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.panel },
  crumbDone: { backgroundColor: colors.turfDeep, borderColor: colors.turf },
  crumbTxt: { color: colors.hazeDim, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.5 },
  crLine: { width: 16, height: 2, backgroundColor: colors.line, borderRadius: 1 },
  field: { borderRadius: radius.md, overflow: 'hidden', position: 'relative' },
  ball: {
    position: 'absolute', left: -BH, top: -BH, width: BS, height: BS, zIndex: 40,
  },
  ballMain: {
    zIndex: 50,
    shadowColor: colors.chalk, shadowOpacity: 0.6, shadowRadius: 6, elevation: 10,
  },
  fieldImg: { width: '100%', height: '100%' },
  zoneGlow: { position: 'absolute', left: 8, right: 8, borderWidth: 2, borderRadius: radius.md },
  playerAbs: { position: 'absolute' },
  pCircle: { width: PS, height: PS, borderRadius: HP, alignItems: 'center', justifyContent: 'center' },
  pIcon: { fontFamily: font.bodyBold, fontSize: 20 },
  cdOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,16,27,0.84)', alignItems: 'center', justifyContent: 'center' },
  cdBox: { backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.flood, paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center', gap: 6 },
  cdTitle: { color: colors.flood, fontFamily: font.bodyBold, fontSize: 14, letterSpacing: 1 },
  cdTimer: { color: colors.flood, fontFamily: font.score, fontSize: 28, letterSpacing: 1 },
  hint: { marginTop: 8, fontFamily: font.bodyBold, fontSize: 13, letterSpacing: 0.5 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, maxWidth: FW, alignSelf: 'center', backgroundColor: colors.night1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, borderColor: colors.line, paddingTop: 24, paddingBottom: 36, paddingHorizontal: 28, alignItems: 'center', gap: 10 },
  ovTitle: { fontFamily: font.poster, fontSize: 24, letterSpacing: 1, textAlign: 'center' },
  ovSub: { color: colors.haze, fontFamily: font.body, fontSize: 13, textAlign: 'center' },
  ovTimer: { color: colors.flood, fontFamily: font.score, fontSize: 20, marginTop: 4 },
  ovBack: { marginTop: 8, paddingVertical: 13, paddingHorizontal: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  ovBackTxt: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 14, letterSpacing: 1 },
  backBtn: { marginBottom: 14, paddingVertical: 13, width: '85%', maxWidth: FW, borderRadius: radius.pill, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  backBtnTxt: { color: colors.haze, fontFamily: font.bodyBold, fontSize: 14, letterSpacing: 1 },
});
