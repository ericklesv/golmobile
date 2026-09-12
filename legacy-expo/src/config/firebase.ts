import { initializeApp } from 'firebase/app';
import { Platform } from 'react-native';
// @ts-ignore — getReactNativePersistence só existe no bundle react-native do SDK
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDtlzzZfbbJ6tiYAz-DAsU0LXD6IzJhofU',
  authDomain: 'futgol-acc08.firebaseapp.com',
  projectId: 'futgol-acc08',
  storageBucket: 'futgol-acc08.firebasestorage.app',
  messagingSenderId: '10563965748',
  appId: '1:10563965748:web:811a2aa57d7c025cf60b61',
};

const app = initializeApp(firebaseConfig);

// No nativo, persiste o login via AsyncStorage; no web o getAuth usa localStorage
export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = getFirestore(app);
