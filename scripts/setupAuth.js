/**
 * Setup Script: Create Admin User
 * 
 * This script creates the initial admin user in Supabase.
 * Run once after executing supabase_setup.sql
 * 
 * Usage: node scripts/setupAuth.js
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service role key (keep secret!)

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: Missing Supabase credentials');
    console.error('Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env.local file');
    console.error('\nExample:');
    console.error('VITE_SUPABASE_URL=https://your-project.supabase.co');
    console.error('SUPABASE_SERVICE_KEY=your-service-role-key');
    process.exit(1);
}

// Create Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Helper: Convert username to internal email
// Helper: Convert username to internal email
const usernameToEmail = (username) => `${username.toLowerCase().trim().replace(/\s+/g, '')}@puntofarma.com`;

// Readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createAdminUser() {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   Supabase Admin User Setup                  ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    try {
        // Get input from user
        const username = await question('Enter admin username (default: admin): ') || 'admin';
        const password = await question('Enter admin password (min 6 chars, default: Admin123!): ') || 'Admin123!';
        const displayName = await question('Enter display name (default: Administrador): ') || 'Administrador';

        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        console.log('\n📝 Creating admin user...');

        const email = usernameToEmail(username);
        console.log(`   Email: ${email}`);

        // 1. Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('username')
            .eq('username', username.toLowerCase().trim())
            .maybeSingle();

        if (existingUser) {
            console.log('\n⚠️  User already exists!');
            const overwrite = await question('Do you want to delete and recreate? (yes/no): ');

            if (overwrite.toLowerCase() !== 'yes') {
                console.log('Operation cancelled.');
                rl.close();
                return;
            }

            // Delete existing user
            const { data: userToDelete } = await supabase
                .from('users')
                .select('id')
                .eq('username', username.toLowerCase().trim())
                .single();

            if (userToDelete) {
                await supabase.from('users').delete().eq('id', userToDelete.id);
                await supabase.auth.admin.deleteUser(userToDelete.id);
                console.log('   Deleted existing user');
            }
        }

        // 2. Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                username: username.toLowerCase().trim(),
                display_name: displayName,
                role: 'admin'
            }
        });

        if (authError) throw authError;
        console.log('   ✅ Auth user created');

        // 3. Insert into users table
        const { error: profileError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                username: username.toLowerCase().trim(),
                display_name: displayName,
                role: 'admin'
            });

        if (profileError) throw profileError;
        console.log('   ✅ User profile created');

        console.log('\n╔═══════════════════════════════════════════════╗');
        console.log('║   ✅ Admin user created successfully!        ║');
        console.log('╚═══════════════════════════════════════════════╝\n');
        console.log('Credentials:');
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Display Name: ${displayName}`);
        console.log('\n📌 Save these credentials securely!\n');
        console.log('Next steps:');
        console.log('   1. Run: npm run dev');
        console.log('   2. Login with the username and password above');
        console.log('   3. Create additional users from Admin Panel\n');

    } catch (error) {
        console.error('\n❌ Error creating admin user:', error.message);
        console.error('Full error:', error);
    } finally {
        rl.close();
    }
}

// Run the setup
createAdminUser();
