/* Developer: paste your Firebase web app config here.
   Console → Project settings → Your apps → SDK setup and configuration.
   Enable Email/Password under Authentication → Sign-in method,
   and create a Realtime Database (start in locked mode, then paste database.rules.json). */
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export const firebaseConfigured = () =>
  !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.projectId);
