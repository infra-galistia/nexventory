// firebase-config.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9fw3e_3SGm__mZ30GJ7i6UjOR7lo-2lo",
  authDomain: "nexventory.firebaseapp.com",
  projectId: "nexventory",
  storageBucket: "nexventory.firebasestorage.app",
  messagingSenderId: "642877803600",
  appId: "1:642877803600:web:db2f66435516b05ac11555",
  measurementId: "G-03CKME0MLW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Use Firebase Auth Emulator only in development
if (window.location.hostname === "localhost") {
  connectAuthEmulator(auth, "http://localhost:9099");
  console.log("Firebase Auth Emulator connected!");
}

export { app, auth, db, analytics, GoogleAuthProvider };


// Example default app state (formerly rendered from Apps Script)
const INITIAL_DATA = {
  scriptUrl: "/",
  currentPage: "index",
  userRole: "Admin",
  barcode: "",
  appName: "NexVentory",
  logoDataUri: ""
};