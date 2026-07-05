import 'react-native-gesture-handler';
import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { SairaCondensed_600SemiBold, SairaCondensed_700Bold } from '@expo-google-fonts/saira-condensed';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthProvider } from './src/context/AuthContext';
import { ToastProvider } from './src/components/Toast';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    SairaCondensed_600SemiBold,
    SairaCondensed_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.night0 }} />;
  }

  const app = (
    <AuthProvider>
      <ToastProvider>
        <NavigationContainer>
          <StatusBar style="light" backgroundColor={colors.night0} />
          <AppNavigator />
        </NavigationContainer>
      </ToastProvider>
    </AuthProvider>
  );

  // No navegador, centraliza num container estreito (experiência de app)
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webOuter}>
        <View style={styles.webInner}>{app}</View>
      </View>
    );
  }
  return app;
}

const styles = StyleSheet.create({
  webOuter: { flex: 1, backgroundColor: '#02080F', alignItems: 'center' },
  webInner: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
});
