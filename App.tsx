import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { SairaCondensed_600SemiBold, SairaCondensed_700Bold } from '@expo-google-fonts/saira-condensed';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthProvider } from './src/context/AuthContext';
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

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" backgroundColor={colors.night0} />
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
