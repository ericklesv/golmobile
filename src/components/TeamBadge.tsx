import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TEAMS } from '../constants/teams';
import { colors, font } from '../theme';

/**
 * Escudo genérico do time: disco com a cor do clube, anel de cal e a sigla
 * em tipografia de placar. Substitui os emojis de escudo em toda a UI.
 */
export default function TeamBadge({ teamId, size = 44 }: { teamId?: string; size?: number }) {
  const team = TEAMS.find((t) => t.id === teamId);
  const bg = team?.color ?? colors.panelHi;
  return (
    <View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderWidth: Math.max(1.5, size * 0.045),
        },
      ]}
    >
      {/* brilho superior (luz do refletor batendo no escudo) */}
      <View style={[styles.gloss, { height: size * 0.42, borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2 }]} />
      <Text style={[styles.abbr, { fontSize: size * 0.34 }]} numberOfLines={1}>
        {team?.abbr ?? '⚽'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    borderColor: 'rgba(237,244,243,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  abbr: {
    color: colors.chalk,
    fontFamily: font.score,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
});
