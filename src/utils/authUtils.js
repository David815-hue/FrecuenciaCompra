import { auth } from '../config/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updateProfile
} from 'firebase/auth';

/**
 * Authentication utility functions using Firebase Auth ONLY
 * All user data (username, displayName, role) stored in Firebase Auth
 */

// Helper: Convert username to internal email
const usernameToEmail = (username) => `${username.toLowerCase().trim().replace(/\s+/g, '')}@puntofarma.com`;

/**
 * Login with username and password (Firebase Auth)
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, user?: object, profile?: object, error?: string}>}
 */
export const loginWithUsername = async (username, password) => {
    try {
        console.log('🔐 LOGIN: Starting with username', username);
        const email = usernameToEmail(username);

        // Sign in with Firebase
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        console.log('🔐 LOGIN: Firebase sign-in successful', firebaseUser.uid);

        // Get custom claims for role
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const role = idTokenResult.claims.role || 'gestora';

        console.log('🔐 LOGIN: Success!', { role });
        return {
            success: true,
            user: firebaseUser,
            profile: {
                username: username.toLowerCase().trim(),
                displayName: firebaseUser.displayName || username,
                role: role
            }
        };
    } catch (error) {
        console.error('❌ LOGIN: Error:', error);
        let errorMessage = 'Error al iniciar sesión';

        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            errorMessage = 'Usuario o contraseña incorrectos';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'Usuario no encontrado';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Demasiados intentos. Intenta más tarde';
        }

        return {
            success: false,
            error: errorMessage
        };
    }
};

/**
 * Logout current user (Firebase)
 */
export const logout = async () => {
    try {
        await firebaseSignOut(auth);
        console.log('🔐 LOGOUT: Success');
        return { success: true };
    } catch (error) {
        console.error('❌ LOGOUT: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get current authenticated user
 * @returns {Promise<{user: object, profile: object} | null>}
 */
export const getCurrentUser = async () => {
    try {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
            console.log('🔍 getCurrentUser: No Firebase user');
            return null;
        }

        // Get custom claims
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const role = idTokenResult.claims.role || 'gestora';
        const username = idTokenResult.claims.username || firebaseUser.email?.split('@')[0] || '';

        return {
            user: firebaseUser,
            profile: {
                username: username,
                displayName: firebaseUser.displayName || username,
                role: role
            }
        };
    } catch (error) {
        console.error('❌ getCurrentUser: Error:', error);
        return null;
    }
};

/**
 * Listen to auth state changes (Firebase)
 * @param {function} callback - Called with user data or null
 */
export const onAuthStateChange = (callback) => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
            callback(null);
            return;
        }

        // Get custom claims
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const role = idTokenResult.claims.role || 'gestora';
        const username = idTokenResult.claims.username || firebaseUser.email?.split('@')[0] || '';

        callback({
            user: firebaseUser,
            profile: {
                username: username,
                displayName: firebaseUser.displayName || username,
                role: role
            }
        });
    });
};

// ===== ADMIN-ONLY FUNCTIONS =====
// These functions call API endpoints (local Express or Vercel serverless)

// Auto-detect API URL based on environment
const API_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'  // Local development
    : '/api';  // Production (Vercel)

/**
 * Get all users (Admin only) - from Firebase Auth via API
 */
export const getAllUsers = async () => {
    try {
        const response = await fetch(`${API_URL}/users`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al obtener usuarios');
        }

        return {
            success: true,
            users: data.users.map(u => ({
                id: u.uid,
                username: u.username,
                displayName: u.displayName,
                role: u.role,
                createdAt: u.createdAt
            }))
        };
    } catch (error) {
        console.error('❌ getAllUsers: Error:', error);
        return {
            success: false,
            error: error.message,
            users: []
        };
    }
};

/**
 * Create a new user (Admin only) - via API with Firebase Admin SDK
 * @param {object} userData - { username, password, displayName, role }
 */
export const createUser = async ({ username, password, displayName, role }) => {
    try {
        console.log('👤 CREATE USER: Starting for', username);

        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, displayName, role })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al crear usuario');
        }

        console.log('👤 CREATE USER: Success!');
        return {
            success: true,
            user: data.user
        };
    } catch (error) {
        console.error('❌ CREATE USER: Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Update user (Admin only) - via API with Firebase Admin SDK
 * @param {string} userId - Firebase UID
 * @param {object} updates - { displayName?, role? }
 */
export const updateUser = async (userId, updates) => {
    try {
        const response = await fetch(`${API_URL}/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al actualizar usuario');
        }

        return { success: true };
    } catch (error) {
        console.error('❌ updateUser: Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Delete user (Admin only) - via API with Firebase Admin SDK
 * @param {string} userId - Firebase UID
 */
export const deleteUser = async (userId) => {
    try {
        const response = await fetch(`${API_URL}/users/${userId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al eliminar usuario');
        }

        return { success: true };
    } catch (error) {
        console.error('❌ deleteUser: Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};
