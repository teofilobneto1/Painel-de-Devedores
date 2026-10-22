// ==========================================
// DADAL TAILANDESAS - CATÁLOGO
// FIREBASE + FIRESTORE + GOOGLE ANALYTICS
// ==========================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCLOoAlrc0MSXZyWd02jj4bsmhdE7MOSpA",
  authDomain: "dadal-tailandesa.firebaseapp.com",
  projectId: "dadal-tailandesa",
  storageBucket: "dadal-tailandesa.firebasestorage.app",
  messagingSenderId: "742144155573",
  appId: "1:742144155573:web:506b7902e8eb9c0bd0c3fc",
  measurementId: "G-YZMJ7PB59F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);