import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, radius, spacing } from '../theme';

/**
 * Campo de texto temático (fundo painel, foco realçado em verde-gramado).
 * Usado nas telas de login e cadastro.
 */
export default function Field({
  iconName,
  ...props
}: TextInputProps & { iconName?: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
      {iconName && (
        <MaterialCommunityIcons
          name={iconName}
          size={20}
          color={focused ? colors.turf : colors.hazeDim}
          style={styles.icon}
        />
      )}
      <TextInput
        {...props}
        placeholderTextColor={colors.hazeDim}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  wrapFocused: { borderColor: colors.turf },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    color: colors.chalk,
    fontFamily: font.body,
    fontSize: 16,
    paddingVertical: 14,
  },
});
