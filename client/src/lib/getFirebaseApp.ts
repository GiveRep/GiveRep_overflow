// src/utils/getFirebaseApp.tsx
import { getApps, initializeApp, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
export function getFirebaseApp() {
  const firebaseConfig = {
    apiKey: "AIzaSyBTdgEWSyfXHO5dgEWnJ-NhqkKWjLEAEzQ",
    authDomain: "suimate-9fdf5.firebaseapp.com",
    projectId: "suimate-9fdf5",
    storageBucket: "suimate-9fdf5.firebasestorage.app",
    messagingSenderId: "250660952377",
    appId: "1:250660952377:web:db1104c062c3d1a69db0e8",
    measurementId: "G-GJDSERVSKC",
  };
  const firebaseApp = !getApps().length
    ? initializeApp(firebaseConfig)
    : getApp();
  const analytics = getAnalytics(firebaseApp);
  return { firebaseApp, analytics };
}
