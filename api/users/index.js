import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin (singleton)
let firebaseApp;
const getFirebaseApp = () => {
    if (!firebaseApp) {
        firebaseApp = initializeApp({
            credential: cert({
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: process.env.FIREBASE_CLIENT_ID,
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: process.env.FIREBASE_CERT_URL
            })
        });
    }
    return firebaseApp;
};

// Helper
const usernameToEmail = (username) => `${username.toLowerCase().trim().replace(/\s+/g, '')}@puntofarma.com`;

/**
 * Vercel Serverless Function: GET/POST /api/users
 */
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const auth = getAuth(getFirebaseApp());

    try {
        // GET /api/users - List all users
        if (req.method === 'GET') {
            const listUsersResult = await auth.listUsers(1000);

            const users = listUsersResult.users.map(user => ({
                uid: user.uid,
                username: user.customClaims?.username || user.email?.split('@')[0] || '',
                displayName: user.displayName || '',
                email: user.email || '',
                role: user.customClaims?.role || 'gestora',
                createdAt: user.metadata.creationTime,
                lastSignIn: user.metadata.lastSignInTime
            }));

            return res.status(200).json({ success: true, users });
        }

        // POST /api/users - Create new user
        if (req.method === 'POST') {
            const { username, password, displayName, role } = req.body;

            // Validation
            if (!username || !password || !displayName || !role) {
                return res.status(400).json({
                    success: false,
                    error: 'Todos los campos son requeridos'
                });
            }

            if (!['admin', 'gestora'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: 'Rol inválido'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'La contraseña debe tener al menos 6 caracteres'
                });
            }

            const email = usernameToEmail(username);

            // Create user
            const userRecord = await auth.createUser({
                email,
                password,
                displayName,
                emailVerified: true
            });

            // Set custom claims
            await auth.setCustomUserClaims(userRecord.uid, {
                role,
                username: username.toLowerCase().trim()
            });

            return res.status(200).json({
                success: true,
                user: {
                    uid: userRecord.uid,
                    username: username.toLowerCase().trim(),
                    displayName,
                    role
                }
            });
        }

        // Method not allowed
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('API Error:', error);
        let errorMessage = error.message;

        if (error.code === 'auth/email-already-exists') {
            errorMessage = 'El usuario ya existe';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseña es demasiado débil';
        }

        return res.status(500).json({ success: false, error: errorMessage });
    }
}
