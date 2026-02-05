// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCElD3EMq_svG2FkPJkrsogDBSlwQV7OP8",
    authDomain: "frecuecia-4ee83.firebaseapp.com",
    projectId: "frecuecia-4ee83",
    storageBucket: "frecuecia-4ee83.firebasestorage.app",
    messagingSenderId: "116081787793",
    appId: "1:116081787793:web:ffd8cba1566faa50f1d030"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);

export default app;
