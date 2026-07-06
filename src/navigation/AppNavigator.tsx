import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { colors, font } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import LeagueScreen from '../screens/LeagueScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TeamScreen from '../screens/TeamScreen';
import PenaltyScreen from '../screens/PenaltyScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(true)); // se falhar, não trava o usuário no onboarding
  }, []);

  if (seen === null) return null; // aguarda ler o flag

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={seen ? 'Login' : 'Onboarding'}>
      {!seen && <Stack.Screen name="Onboarding" component={OnboardingScreen} />}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.night0,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.turf,
        tabBarInactiveTintColor: colors.hazeDim,
        tabBarLabelStyle: { fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.5 },
      }}
    >
      <Tab.Screen
        name="Jogar"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="soccer" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Liga"
        component={LeagueScreen}
        options={{ tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="trophy-variant" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Rankings"
        component={RankingScreen}
        options={{ tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="podium" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AppTabs} />
      <Stack.Screen name="Team" component={TeamScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="Penalty"
        component={PenaltyScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return user ? <AppStack /> : <AuthStack />;
}
