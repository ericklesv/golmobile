import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, radius, spacing, glow } from '../theme';

/**
 * Estado vazio ilustrado: aro luminoso com ícone + título + subtítulo.
 * Nada de "tela branca com texto solto".
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  tint = colors.turf,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  subtitle?: string;
  tint?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, { borderColor: tint + '44' }, glow(tint + '55', 18)]}>
        <MaterialCommunityIcons name={icon} size={36} color={tint} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.md },
  ring: {
    width: 84, height: 84, borderRadius: radius.pill, borderWidth: 1.5,
    backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 16, textAlign: 'center' },
  subtitle: { color: colors.haze, fontFamily: font.body, fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
});
