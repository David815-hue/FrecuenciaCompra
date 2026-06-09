import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cacjzokegdnizfsjivya.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhY2p6b2tlZ2RuaXpmc2ppdnlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTAxODMsImV4cCI6MjA4NDA2NjE4M30.lIxVBZQgMhkK8mN4tsy7HbjNjMK_PW63a-KtNX-Kaow';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching one row from campaign_assignments...");
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Error:", error);
    return;
  }

  if (data.length === 0) {
    console.log("No assignments found.");
    return;
  }

  const a = data[0];
  console.log("Assignment structure:", JSON.stringify(a, null, 2));
}

run();
