import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
const result = config({ path: '.env.local' });

if (result.error) {
    console.error('Error loading .env.local:', result.error);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: Missing credentials in .env.local');
    console.log('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function confirmAllUsers() {
    console.log('🔍 Fetching users...');

    // List all users
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('❌ Error fetching users:', error);
        return;
    }

    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        if (!user.email_confirmed_at) {
            console.log(`⚠️  Confirming user: ${user.email} (${user.id})...`);

            const { error: updateError } = await supabase.auth.admin.updateUserById(
                user.id,
                { email_confirm: true }
            );

            if (updateError) {
                console.error(`   ❌ Failed: ${updateError.message}`);
            } else {
                console.log(`   ✅ Confirmed!`);
            }
        } else {
            console.log(`   ✅ Already confirmed: ${user.email}`);
        }
    }

    console.log('\n🎉 Done! All users should be confirmed now.');
}

confirmAllUsers();
