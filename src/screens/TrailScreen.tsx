import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, SafeAreaView, Dimensions, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ACTION_COOLDOWNS } from '../constants/teams';
import { getTimeRemaining, formatCountdown } from '../utils/gameLogic';
import { trailPickAction, isCooldownError } from '../services/game';

const { width: SW } = Dimensions.get('window');
// Image trilha.png is 1024x1536 (2:3). Display at screen width.
const FW = Math.min(SW, 420);
const FH = FW * 1.5;
const PS = 46;
const HP = PS / 2;
const BS = 14;   // ball diameter
const BH = BS / 2;
// Goalkeeper position (bottom goal, center)
const GK_X = FW * 0.500;
const GK_Y = FH * 0.880;
// Opponent goal (top net center)
const GOAL_X = FW * 0.500;
const GOAL_Y = FH * 0.055;

const TRAIL_CD = ACTION_COOLDOWNS['trilha'];

// Player positions as [xFraction, yFraction] of image (1024x1536)
// y = midpoint of player-figure vertical span measured from pixel analysis
const LINES = [
  {
    id: 'defense' as const, label: 'DEFESA', color: '#43A047', total: 4, safe: 3,
    players: [[0.215,0.710],[0.396,0.710],[0.605,0.710],[0.782,0.710]] as [number,number][],
  },
  {
    id: 'midfield' as const, label: 'MEIO CAMPO', color: '#FB8C00', total: 3, safe: 2,
    players: [[0.268,0.490],[0.497,0.490],[0.725,0.490]] as [number,number][],
  },
  {
    id: 'attack' as const, label: 'ATAQUE', color: '#E53935', total: 3, safe: 1,
    players: [[0.225,0.298],[0.497,0.308],[0.768,0.298]] as [number,number][],
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
  const { user, profile, refreshProfile } = useAuth();
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
      Animated.timing(ballX, {
        toValue: toX, duration: dur,
        easing: Easing.inOut(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(ballY, {
        toValue: toY, duration: dur,
        easing: Easing.inOut(Easing.quad), useNativeDriver: true,
      }),
    ]).start(cb ? ({ finished }) => { if (finished) cb(); } : undefined);
  }

  // Cada palpite é validado no servidor (Cloud Function `trailPick`);
  // a resposta traz as minas da linha para revelar
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

    // After ball arrives, reveal the whole line with the server's mines
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
        // Ball flies into the top goal
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
          <Text style={s.xBtnTxt}>{'\u2715'}</Text>
        </TouchableOpacity>
        <Text style={s.title}>{'\u26a1  T R I L H A'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.crumbs}>
        {LINES.map((l, i) => (
          <React.Fragment key={l.id}>
            <View style={[
              s.crumb,
              phase > i && s.crumbDone,
              phase === i && gameOver === null && { backgroundColor: l.color + '28', borderColor: l.color },
            ]}>
              <Text style={[s.crumbTxt, phase === i && gameOver === null && { color: l.color }]}>
                {l.label}
              </Text>
            </View>
            <View style={[s.crLine, phase > i && { backgroundColor: '#00e676' }]} />
          </React.Fragment>
        ))}
        <View style={[s.crumb, gameOver === 'goal' && { backgroundColor: '#FFD70028', borderColor: '#FFD700' }]}>
          <Text style={{ fontSize: 13, color: gameOver === 'goal' ? '#FFD700' : '#2a4060', fontWeight: '800' }}>GOL</Text>
        </View>
      </View>

      <View style={[s.field, { width: FW, height: FH }]}>
        <Image
          source={require('../../assets/trilha.png')}
          style={s.fieldImg}
          resizeMode="cover"
        />

        {/* Animated ball */}
        <Animated.Image
          source={require('../../assets/bola.png')}
          style={[
            s.ball,
            { transform: [{ translateX: ballX }, { translateY: ballY }] },
          ]}
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
            const isPast   = phase > li;
            let bg = 'transparent', bc = 'transparent', label = '', tColor = '#fff';
            let disabled = true, showGlow = false, glowColor = '#fff';

            if (p.revealed) {
              if (!p.mine) {
                bg = 'rgba(0,200,80,0.75)'; bc = '#00e676'; label = '\u2713'; tColor = '#fff';
                if (p.picked) { showGlow = true; glowColor = '#00e676'; }
              } else {
                bg = 'rgba(220,30,30,0.80)'; bc = '#ff5252'; label = '\u2717'; tColor = '#fff';
                if (p.picked) { showGlow = true; glowColor = '#ff5252'; }
              }
            } else if (isPast) {
              bg = 'rgba(0,180,60,0.60)'; bc = '#00e676'; label = '\u2713'; tColor = '#00e676';
            } else if (isActive) {
              bg = line.color + '55'; bc = line.color;
              label = String(pi + 1); tColor = '#fff';
              disabled = false; showGlow = true; glowColor = line.color;
            }
            // locked/inactive: transparent (real player from image shows through)

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
                  showGlow && {
                    shadowColor: glowColor,
                    shadowOpacity: 0.95,
                    shadowRadius: 16,
                    elevation: 12,
                  },
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
              <Text style={s.cdTitle}>EM RECARGA</Text>
              <Text style={s.cdTimer}>{formatCountdown(reloadMs)}</Text>
            </View>
          </View>
        )}
      </View>

      {gameOver === null && !inCooldown && (
        <Text style={[s.hint, { color: activeLine.color }]}>{activeLine.label}  {'\u2014'}  escolha um jogador</Text>
      )}

      <View style={{ flex: 1 }} />

      {gameOver !== null && (
        <Animated.View style={[s.overlay, { opacity: ovOpacity, transform: [{ translateY: ovTransY }] }]}>
          {gameOver === 'fail' ? (
            <>
              <Text style={[s.ovTitle, { color: '#ff5252', fontSize: 32 }]}>{'\uD83D\uDE24'}</Text>
              <Text style={[s.ovTitle, { color: '#ff5252' }]}>VOCE FOI DESARMADO!</Text>
              <Text style={s.ovSub}>Aguarde para tentar novamente.</Text>
              {reloadMs > 0 && <Text style={s.ovTimer}>{formatCountdown(reloadMs)}</Text>}
            </>
          ) : (
            <>
              <Text style={[s.ovTitle, { color: '#FFD700', fontSize: 36 }]}>{'\uD83C\uDFC6'}</Text>
              <Text style={[s.ovTitle, { color: '#FFD700' }]}>TRILHA COMPLETA!</Text>
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
  root: { flex: 1, backgroundColor: '#050d18', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  xBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  xBtnTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  title: { color: '#FF7043', fontSize: 17, fontWeight: 'bold', letterSpacing: 3 },
  crumbs: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  crumb: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: '#2a3a55', backgroundColor: '#111e30' },
  crumbDone: { backgroundColor: '#0a2010', borderColor: '#00e676' },
  crumbTxt: { color: '#2a4060', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  crLine: { width: 16, height: 2, backgroundColor: '#2a3a55', borderRadius: 1 },
  field: { borderRadius: 10, overflow: 'hidden', position: 'relative' },
  ball: {
    position: 'absolute', left: -BH, top: -BH,
    width: BS, height: BS,
    shadowColor: '#fff', shadowOpacity: 0.6, shadowRadius: 6, elevation: 10,
    zIndex: 50,
  },
  fieldImg: { width: '100%', height: '100%' },
  zoneGlow: { position: 'absolute', left: 8, right: 8, borderWidth: 2, borderRadius: 10 },
  playerAbs: { position: 'absolute' },
  pCircle: { width: PS, height: PS, borderRadius: HP, alignItems: 'center', justifyContent: 'center' },
  pIcon: { fontSize: 20, fontWeight: 'bold' },
  cdOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,10,20,0.82)', alignItems: 'center', justifyContent: 'center' },
  cdBox: { backgroundColor: '#0d1a30', borderRadius: 16, borderWidth: 1.5, borderColor: '#FF9800', paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center', gap: 6 },
  cdTitle: { color: '#FF9800', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  cdTimer: { color: '#FFD700', fontSize: 28, fontWeight: 'bold' },
  hint: { marginTop: 8, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,12,22,0.97)', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 2, borderColor: '#1a2a40', paddingTop: 24, paddingBottom: 36, paddingHorizontal: 28, alignItems: 'center', gap: 10 },
  ovTitle: { fontSize: 22, fontWeight: 'bold', letterSpacing: 1, textAlign: 'center' },
  ovSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  ovTimer: { color: '#FF9800', fontSize: 17, fontWeight: '700', marginTop: 4 },
  ovBack: { marginTop: 8, paddingVertical: 13, paddingHorizontal: 40, borderRadius: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ovBackTxt: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '600' },
  backBtn: { marginBottom: 14, paddingVertical: 13, width: '85%', borderRadius: 40, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  backBtnTxt: { color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600' },
});