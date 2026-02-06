import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load environment variables
config({ path: '.env.local' });

// Initialize Firebase Admin
const firebaseApp = initializeApp({
    credential: cert('./firebase-service-account.json')
});

const auth = getAuth(firebaseApp);
const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper
const usernameToEmail = (username) => `${username.toLowerCase().trim().replace(/\s+/g, '')}@puntofarma.com`;

// ===== USER MANAGEMENT ENDPOINTS =====

/**
 * GET /api/users - List all users
 */
app.get('/api/users', async (req, res) => {
    try {
        const listUsersResult = await auth.listUsers(1000); // Max 1000 users

        const users = listUsersResult.users.map(user => ({
            uid: user.uid,
            username: user.customClaims?.username || user.email?.split('@')[0] || '',
            displayName: user.displayName || '',
            email: user.email || '',
            role: user.customClaims?.role || 'gestora',
            createdAt: user.metadata.creationTime,
            lastSignIn: user.metadata.lastSignInTime
        }));

        res.json({ success: true, users });
    } catch (error) {
        console.error('Error listing users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/users - Create new user
 * Body: { username, password, displayName, role }
 */
app.post('/api/users', async (req, res) => {
    try {
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
            username: username.toLowerCase().trim(),
            mustChangePassword: true // New users must change password
        });

        res.json({
            success: true,
            user: {
                uid: userRecord.uid,
                username: username.toLowerCase().trim(),
                displayName,
                role,
                mustChangePassword: true
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        let errorMessage = error.message;

        if (error.code === 'auth/email-already-exists') {
            errorMessage = 'El usuario ya existe';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseña es demasiado débil';
        }

        res.status(500).json({ success: false, error: errorMessage });
    }
});

/**
 * POST /api/change-password - Change user password
 * Body: { uid, newPassword }
 */
app.post('/api/change-password', async (req, res) => {
    try {
        const { uid, newPassword } = req.body;

        if (!uid || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Faltan datos requeridos'
            });
        }

        // Easter Egg & Validation
        if (newPassword === '123456' || newPassword === '12345678' || newPassword === '123456789') {
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

        // Update password in Firebase
        await auth.updateUser(uid, {
            password: newPassword
        });

        // Remove mustChangePassword claim
        const user = await auth.getUser(uid);
        const currentClaims = user.customClaims || {};

        const newClaims = { ...currentClaims };
        delete newClaims.mustChangePassword;

        await auth.setCustomUserClaims(uid, newClaims);

        res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/users/:uid - Update user
 * Body: { displayName?, role? }
 */
app.put('/api/users/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const { displayName, role } = req.body;

        const updates = {};
        if (displayName) updates.displayName = displayName;

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

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/users/:uid - Delete user
 */
app.delete('/api/users/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        await auth.deleteUser(uid);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 User Management API Server running on http://localhost:${PORT}`);
    console.log('   Available endpoints:');
    console.log('   GET    /api/users       - List all users');
    console.log('   POST   /api/users       - Create user');
    console.log('   PUT    /api/users/:uid  - Update user');
    console.log('   DELETE /api/users/:uid  - Delete user\n');
});
