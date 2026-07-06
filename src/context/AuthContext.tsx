import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

interface UserProfile {
  uid: string;
  nick: string;
  teamId: string;
  totalGoals: number;
  totalKicks: number;
  hourGoals: number;
  hourKey?: string;
  roundGoals: number;
  roundKey?: string;
  lastKickTime: number;
  lastAutoTime?: number;
  lastPenaltiTime?: number;
  lastFaltaTime?: number;
  lastTrilhaTime?: number;
  trailPosition?: number; // 0=início, 1=passou zaga, 2=passou meio, 3=passou ataque(gol)
}

interface AuthContextData {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nick: string, teamId: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      setProfile(snap.data() as UserProfile);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadProfile(firebaseUser.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function register(email: string, password: string, nick: string, teamId: string) {
    const nickTrim = nick.trim();
    const nickKey = nickTrim.toLowerCase(); // unicidade case-insensitive
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const newProfile: UserProfile = {
      uid,
      nick: nickTrim,
      teamId,
      totalGoals: 0,
      totalKicks: 0,
      hourGoals: 0,
      roundGoals: 0,
      lastKickTime: 0,
    };

    // Reserva o nick e cria o perfil atomicamente. Se o nick já existir (ou
    // qualquer passo falhar), desfaz a conta recém-criada p/ não deixar órfã.
    try {
      await runTransaction(db, async (tx) => {
        const nickRef = doc(db, 'nicks', nickKey);
        const snap = await tx.get(nickRef);
        if (snap.exists()) {
          throw Object.assign(new Error('nick já em uso'), { code: 'nick-taken' });
        }
        tx.set(nickRef, { uid });
        tx.set(doc(db, 'users', uid), { ...newProfile, createdAt: serverTimestamp() });
      });
    } catch (e) {
      await cred.user.delete().catch(() => {});
      throw e;
    }

    setProfile(newProfile);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email.trim());
  }

  async function logout() {
    await signOut(auth);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.uid);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, resetPassword, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
