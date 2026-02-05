import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as readline from 'readline';

// Load environment variables
config({ path: '.env.local' });

// Firebase Admin SDK initialization
let firebaseApp;
try {
    firebaseApp = initializeApp({
        credential: cert('./firebase-service-account.json')
    });
} catch (error) {
    console.error('❌ Error initializing Firebase Admin:');
    console.error('   Make sure firebase-service-account.json exists in the root directory.');
    process.exit(1);
}

const firebaseAuth = getAuth(firebaseApp);

// Helper
const usernameToEmail = (username) => `${username.toLowerCase().trim().replace(/\s+/g, '')}@puntofarma.com`;

// Readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createAdminUser() {
    console.log('\n🔧 Firebase Auth - Admin User Setup\n');

    const username = await question('Enter admin username: ');
    const password = await question('Enter admin password (min 6 chars): ');
    const displayName = await question('Enter admin display name: ');

    const email = usernameToEmail(username);
    console.log(`\n📧 Generated email: ${email}\n`);

    try {
        // Check if user already exists
        let existingUser;
        try {
            existingUser = await firebaseAuth.getUserByEmail(email);
        } catch (err) {
            // User doesn't exist, that's fine
        }

        if (existingUser) {
            console.log('⚠️  User already exists in Firebase Auth');
            const overwrite = await question('Delete and recreate? (yes/no): ');
            if (overwrite.toLowerCase() !== 'yes') {
                console.log('❌ Aborted');
                rl.close();
                return;
            }

            await firebaseAuth.deleteUser(existingUser.uid);
            console.log('   🗑️  Deleted from Firebase\n');
        }

        // Create Firebase Auth user
        console.log('🔥 Creating Firebase user...');
        const firebaseUser = await firebaseAuth.createUser({
            email,
            password,
            emailVerified: true,
            displayName
        });

        console.log('   ✅ Firebase user created:', firebaseUser.uid);

        // Set custom claims (role and username)
        console.log('🔐 Setting custom claims (role: admin)...');
        await firebaseAuth.setCustomUserClaims(firebaseUser.uid, {
            role: 'admin',
            username: username.toLowerCase().trim()
        });

        console.log('   ✅ Custom claims set\n');
        console.log('✅ Admin user created successfully!');
        console.log(`\n🔑 Login credentials:`);
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Role: admin\n`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }

    rl.close();
}

createAdminUser();
