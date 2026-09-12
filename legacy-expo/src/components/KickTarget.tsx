import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, glow } from '../theme';

/**
 * Alvo de chute iluminado: disco com um anel de cal que se completa conforme
 * o cooldown recarrega (como o arco do pênalti). Pronto = anel verde + brilho
 * e ícone; recarregando = contagem regressiva no centro.
 */
export default function KickTarget({
  iconName,
  label,
  color,
  ready,
  progress,
  countdown,
  active = false,
  onPress,
  size = 64,
}: {
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
  ready: boolean;
  progress: number; // 0..1 (1 = pronto)
  countdown: string;
  active?: boolean;
  onPress?: () => void;
  size?: number;
}) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = ready ? 1 : Math.max(0, Math.min(1, progress));
  const ringColor = ready ? colors.turf : color;

  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 5, tension: 160 }).start();

  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={onPress}
      onPressIn={() => spring(0.88)}
      onPressOut={() => spring(1)}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          styles.disc,
          { width: size, height: size, borderRadius: size / 2, transform: [{ scale }] },
          ready && glow(colors.turfGlow, 16),
          !ready && active && glow(color, 12),
        ]}
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ringColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            rotation={-90}
            originX={size / 2}
            originY={size / 2}
          />
        </Svg>
        {ready ? (
          <MaterialCommunityIcons name={iconName} size={size * 0.42} color={color} />
        ) : (
          <Text style={styles.countdown}>{countdown}</Text>
        )}
      </Animated.View>
      <View style={styles.labelRow}>
        <View style={[styles.dot, { backgroundColor: ready ? colors.turf : colors.hazeDim }]} />
        <Text style={[styles.label, { color: ready ? colors.chalk : colors.haze }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 7 },
  disc: {
    backgroundColor: colors.night1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    color: colors.flood,
    fontFamily: font.score,
    fontSize: 15,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: {
    fontFamily: font.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
});
