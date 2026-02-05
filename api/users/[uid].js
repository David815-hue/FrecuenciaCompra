import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin (singleton)
let firebaseApp;

const formatPrivateKey = (key) => {
    if (!key) return undefined;

    // Remove any surrounding quotes if they exist (common Vercel env var issue)
    let formattedKey = key.replace(/^['"]|['"]$/g, '');

    // Replace literal \n with actual newlines
    formattedKey = formattedKey.replace(/\\n/g, '\n');

    return formattedKey;
};

const getFirebaseApp = () => {
    if (!firebaseApp) {
        const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

        // Debug log (safe)
        if (!privateKey) {
            console.error('❌ FIREBASE_PRIVATE_KEY is missing');
        } else if (!privateKey.includes('BEGIN PRIVATE KEY')) {
            console.error('❌ FIREBASE_PRIVATE_KEY appears invalid (missing header)');
        }

        firebaseApp = initializeApp({
            credential: cert({
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: privateKey,
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

/**
 * Vercel Serverless Function: PUT/DELETE /api/users/[uid]
 */
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { uid } = req.query;
    const auth = getAuth(getFirebaseApp());

    try {
        // PUT /api/users/:uid - Update user
        if (req.method === 'PUT') {
            const { displayName, role, password } = req.body;

            const updates = {};
            if (displayName) updates.displayName = displayName;
            if (password && password.length >= 6) updates.password = password;

            // Update user in Firebase Auth
            await auth.updateUser(uid, updates);

            // Update custom claims if role changed
            if (role) {
                const user = await auth.getUser(uid);
                const currentClaims = user.customClaims || {};
                await auth.setCustomUserClaims(uid, {
                    ...currentClaims,
                    role
                });
            }

            return res.status(200).json({ success: true });
        }

        // DELETE /api/users/:uid - Delete user
        if (req.method === 'DELETE') {
            await auth.deleteUser(uid);
            return res.status(200).json({ success: true });
        }

        // Method not allowed
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
