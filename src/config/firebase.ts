import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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

export const auth = getAuth(app);
export const db = getFirestore(app);
