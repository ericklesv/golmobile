import React, { useEffect } from 'react';
import { Animated, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { colors, radius as themeRadius } from '../theme';

/**
 * Bloco de esqueleto (placeholder de carregamento). Todos os blocos
 * compartilham um único pulso de opacidade — um loop só para a tela inteira.
 */
const pulse = new Animated.Value(0.5);
let started = false;
function ensurePulse() {
  if (started) return;
  started = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 720, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 720, useNativeDriver: true }),
    ])
  ).start();
}

export default function Skeleton({
  width = '100%',
  height = 12,
  radius = themeRadius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  useEffect(() => {
    ensurePulse();
  }, []);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.panelHi, opacity: pulse },
        style,
      ]}
    />
  );
}
