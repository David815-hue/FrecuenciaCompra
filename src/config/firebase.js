// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBM9CWHGPc9n6x859m_OLgWq4XwSy9bhcg",
    authDomain: "frecuenciaclientes.firebaseapp.com",
    projectId: "frecuenciaclientes",
    storageBucket: "frecuenciaclientes.firebasestorage.app",
    messagingSenderId: "130145316766",
    appId: "1:130145316766:web:f6e088f1696e7ddce5b08f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
