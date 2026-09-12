import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Modal, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, radius, spacing, glow } from '../theme';

/**
 * Toast + diálogo de confirmação temáticos, funcionam em web e nativo
 * (o Alert.alert do RN não renderiza no navegador).
 */
type ToastType = 'info' | 'error' | 'success';
interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
}
interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {}, confirm: () => {} });
export const useToast = () => useContext(ToastContext);

const TYPE = {
  info: { color: colors.chalk, icon: 'information' as const },
  error: { color: colors.red, icon: 'alert-circle' as const },
  success: { color: colors.turf, icon: 'check-circle' as const },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setCurrent(null));
  }, [anim]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    setCurrent({ message, type });
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 11 }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, 2800);
  }, [anim, hide]);

  const confirm = useCallback((options: ConfirmOptions) => setConfirmState(options), []);

  const meta = current ? TYPE[current.type] : TYPE.info;

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {current && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastWrap,
            {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
            },
          ]}
        >
          <View style={[styles.toast, { borderColor: meta.color }]}>
            <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
            <Text style={styles.toastText}>{current.message}</Text>
          </View>
        </Animated.View>
      )}

      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => setConfirmState(null)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{confirmState?.title}</Text>
            {!!confirmState?.message && <Text style={styles.dialogMessage}>{confirmState.message}</Text>}
            <View style={styles.dialogButtons}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setConfirmState(null)} activeOpacity={0.8}>
                <Text style={styles.dialogCancelText}>{confirmState?.cancelText ?? 'Cancelar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirm, confirmState?.destructive && styles.dialogConfirmDanger]}
                onPress={() => { const cb = confirmState?.onConfirm; setConfirmState(null); cb?.(); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.dialogConfirmText, confirmState?.destructive && { color: colors.chalk }]}>
                  {confirmState?.confirmText ?? 'Confirmar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', top: 48, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.panelHi, borderRadius: radius.md, borderWidth: 1,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 420,
    ...glow('rgba(0,0,0,0.5)', 12),
  },
  toastText: { color: colors.chalk, fontFamily: font.bodyMed, fontSize: 14, flexShrink: 1 },

  backdrop: { flex: 1, backgroundColor: 'rgba(2,8,15,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  dialog: {
    width: '100%', maxWidth: 380, backgroundColor: colors.panel, borderRadius: radius.lg,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.line,
  },
  dialogTitle: { color: colors.chalk, fontFamily: font.bodyBold, fontSize: 18 },
  dialogMessage: { color: colors.haze, fontFamily: font.body, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  dialogButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  dialogCancel: { flex: 1, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  dialogCancelText: { color: colors.haze, fontFamily: font.bodyBold, fontSize: 14 },
  dialogConfirm: { flex: 1, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.turf },
  dialogConfirmDanger: { backgroundColor: colors.red },
  dialogConfirmText: { color: colors.night0, fontFamily: font.bodyBold, fontSize: 14 },
});
