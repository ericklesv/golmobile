import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
  Circle,
  Line,
  Path,
} from 'react-native-svg';
import { colors } from '../theme';

/**
 * Fundo "estádio à noite": um campo de futebol em visão de cima preenchendo a
 * tela, sob os holofotes. Camadas (de trás pra frente):
 *  1. céu azul-meia-noite (gradiente vertical)
 *  2. dois focos âmbar de refletor sangrando dos cantos de cima
 *  3. horizonte de gramado luminoso subindo da base
 *  4. marcações de cal proporcionais à tela (linha de fundo, meio-campo,
 *     círculo central e grandes áreas em cima/embaixo)
 * `showPitch` liga as marcações (ligado por padrão).
 */
export default function NightBackground({
  children,
  showPitch = true,
  style,
}: {
  children: React.ReactNode;
  showPitch?: boolean;
  style?: ViewStyle;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const { w, h } = size;
  const line = { stroke: colors.chalk, strokeWidth: 1.5, strokeOpacity: 0.1, fill: 'none' } as const;

  // Geometria do campo (proporcional à tela medida)
  const m = Math.max(14, w * 0.05); // margem lateral = linhas de fundo
  const midY = h / 2;
  const cR = w * 0.24; // raio do círculo central
  const boxW = w * 0.62; // largura da grande área
  const boxH = h * 0.11; // profundidade da grande área
  const goalW = w * 0.34; // largura da pequena área
  const goalH = h * 0.05;
  const boxX = (w - boxW) / 2;
  const goalX = (w - goalW) / 2;
  const arc = w * 0.12; // raio do arco da meia-lua

  return (
    <View style={[styles.root, style]} onLayout={onLayout}>
      {/* 1. céu */}
      <LinearGradient
        colors={[colors.night0, colors.night1, '#06131F']}
        locations={[0, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* 2-4. luz e gramado + campo */}
      {w > 0 && (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="floodL" cx="8%" cy="-4%" r="55%">
              <Stop offset="0" stopColor={colors.flood} stopOpacity={0.2} />
              <Stop offset="0.55" stopColor={colors.flood} stopOpacity={0.045} />
              <Stop offset="1" stopColor={colors.flood} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="floodR" cx="92%" cy="-4%" r="55%">
              <Stop offset="0" stopColor={colors.flood} stopOpacity={0.17} />
              <Stop offset="0.55" stopColor={colors.flood} stopOpacity={0.04} />
              <Stop offset="1" stopColor={colors.flood} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="turf" cx="50%" cy="102%" r="85%">
              <Stop offset="0" stopColor={colors.turf} stopOpacity={0.22} />
              <Stop offset="0.5" stopColor={colors.turf} stopOpacity={0.07} />
              <Stop offset="1" stopColor={colors.turf} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          <Rect x={0} y={0} width={w} height={h} fill="url(#floodL)" />
          <Rect x={0} y={0} width={w} height={h} fill="url(#floodR)" />
          <Rect x={0} y={0} width={w} height={h} fill="url(#turf)" />

          {showPitch && (
            <>
              {/* linhas de fundo (retângulo do campo) */}
              <Rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx={6} {...line} />

              {/* meio-campo + círculo central */}
              <Line x1={m} y1={midY} x2={w - m} y2={midY} {...line} />
              <Circle cx={w / 2} cy={midY} r={cR} {...line} />
              <Circle cx={w / 2} cy={midY} r={3} fill={colors.chalk} fillOpacity={0.18} stroke="none" />

              {/* grande + pequena área (topo) */}
              <Rect x={boxX} y={m} width={boxW} height={boxH} {...line} />
              <Rect x={goalX} y={m} width={goalW} height={goalH} {...line} />
              <Path
                d={`M ${w / 2 - arc} ${m + boxH} A ${arc} ${arc} 0 0 0 ${w / 2 + arc} ${m + boxH}`}
                {...line}
              />

              {/* grande + pequena área (base) */}
              <Rect x={boxX} y={h - m - boxH} width={boxW} height={boxH} {...line} />
              <Rect x={goalX} y={h - m - goalH} width={goalW} height={goalH} {...line} />
              <Path
                d={`M ${w / 2 - arc} ${h - m - boxH} A ${arc} ${arc} 0 0 1 ${w / 2 + arc} ${h - m - boxH}`}
                {...line}
              />
            </>
          )}
        </Svg>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night0 },
});
