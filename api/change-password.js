import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin (Singleton pattern for Vercel)
if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const auth = getAuth();

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { uid, newPassword } = req.body;

    if (!uid || !newPassword) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos (uid, newPassword)' });
    }

    // Easter Egg & Validation
    if (['123456', '12345678', '123456789', '000000', '111111'].includes(newPassword)) {
        return res.status(400).json({
            success: false,
            error: 'No ponga esa contraseña es muy facil'
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            error: 'La contraseña debe tener al menos 6 caracteres'
        });
    }

    try {
        console.log(`🔐 Updating password for user: ${uid}`);

        // Update password in Firebase
        await auth.updateUser(uid, {
            password: newPassword
        });

        // Remove mustChangePassword claim
        const user = await auth.getUser(uid);
        const currentClaims = user.customClaims || {};

        const newClaims = { ...currentClaims };
        if (newClaims.mustChangePassword) {
            delete newClaims.mustChangePassword;
            await auth.setCustomUserClaims(uid, newClaims);
            console.log(`✅ Removed mustChangePassword claim for ${uid}`);
        }

        return res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        console.error('❌ Error updating password:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor'
        });
    }
}
