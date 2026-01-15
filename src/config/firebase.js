// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCZDfLkclF0YdUMwhancuT1nnQtPxbb0nc",
    authDomain: "frecuencia-5ef24.firebaseapp.com",
    projectId: "frecuencia-5ef24",
    storageBucket: "frecuencia-5ef24.firebasestorage.app",
    messagingSenderId: "425915232080",
    appId: "1:425915232080:web:d514476e7b02f6db750655"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
