import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load environment variables
config({ path: '.env.local' });

// Initialize Firebase Admin SDK
let firebaseApp;
try {
    console.log('🔥 Initializing Firebase Admin...');
    firebaseApp = initializeApp({
        credential: cert('./firebase-service-account.json')
    });
} catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
    process.exit(1);
}

const auth = getAuth(firebaseApp);

async function forceResetAllUsers() {
    console.log('\n🔒 Starting Global Password Reset Enforcement...\n');

    try {
        let users = [];
        let nextPageToken;

        // Fetch all users
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);
            users = users.concat(listUsersResult.users);
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        console.log(`Found ${users.length} users.`);

        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                const currentClaims = user.customClaims || {};

                // Skip if already set (optimization)
                if (currentClaims.mustChangePassword === true) {
                    console.log(`   ⏭️  Skipping ${user.email} (already flagged)`);
                    continue;
                }

                const newClaims = {
                    ...currentClaims,
                    mustChangePassword: true
                };

                await auth.setCustomUserClaims(user.uid, newClaims);
                console.log(`   ✅ Flagged ${user.email || user.uid} to change password`);
                successCount++;
            } catch (err) {
                console.error(`   ❌ Failed to update ${user.email}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n=============================================');
        console.log(`🎉 Process Complete!`);
        console.log(`✅ Updated: ${successCount}`);
        console.log(`⏭️  Skipped: ${users.length - successCount - errorCount}`);
        console.log(`❌ Errors:  ${errorCount}`);
        console.log('=============================================\n');

    } catch (error) {
        console.error('❌ Fatal Error:', error);
    }
}

forceResetAllUsers();
