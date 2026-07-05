import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Fundo "estádio à noite": gradiente azul-meia-noite com linhas de cal
 * (círculo central + linha do meio) esmaecidas ao fundo, como um gramado
 * sob os holofotes. `showPitch` liga as marcações (ligado por padrão).
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
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={[colors.night0, colors.night1, colors.night0]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {showPitch && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* linha do meio de campo */}
          <Line x1="0" y1="38%" x2="100%" y2="38%" stroke={colors.chalk} strokeWidth={1} strokeOpacity={0.05} />
          {/* círculo central */}
          <Circle cx="50%" cy="38%" r="120" stroke={colors.chalk} strokeWidth={1} strokeOpacity={0.05} fill="none" />
          <Circle cx="50%" cy="38%" r="3" fill={colors.chalk} fillOpacity={0.08} />
        </Svg>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night0 },
});
