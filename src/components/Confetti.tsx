import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const { height: SH, width: SW } = Dimensions.get('window');
const PALETTE = [colors.turf, colors.flood, colors.chalk, colors.red, '#3FA9F5'];

/**
 * Chuva de confete comemorativa (sem libs): partículas caem do topo com
 * deriva, giro e fade. Toca uma vez ao montar — remonte com `key` para repetir.
 */
export default function Confetti({
  count = 26,
  onDone,
}: {
  count?: number;
  onDone?: () => void;
}) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * SW,
        size: 6 + Math.random() * 7,
        color: PALETTE[i % PALETTE.length],
        drift: (Math.random() * 2 - 1) * 90,
        delay: Math.random() * 240,
        dur: 1100 + Math.random() * 700,
        spin: (Math.random() * 2 - 1) * 3,
        t: new Animated.Value(0),
        op: new Animated.Value(1),
      })),
    [count]
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const anims = parts.map((p) =>
      Animated.parallel([
        Animated.timing(p.t, { toValue: 1, duration: p.dur, delay: p.delay, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(p.delay + p.dur * 0.55),
          Animated.timing(p.op, { toValue: 0, duration: p.dur * 0.45, useNativeDriver: true }),
        ]),
      ])
    );
    Animated.parallel(anims).start(() => onDone && onDone());
  }, [parts]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {parts.map((p, i) => {
        const translateY = p.t.interpolate({ inputRange: [0, 1], outputRange: [-30, SH + 40] });
        const translateX = p.t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
        const rotate = p.t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.left,
              top: 0,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              borderRadius: 2,
              opacity: p.op,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
