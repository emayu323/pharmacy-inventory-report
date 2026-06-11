
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // Try to select the 'memo' column
    const { data, error } = await supabase
        .from('patients')
        .select('memo')
        .limit(1);

    if (error) {
        console.log("ERROR: " + error.message);
    } else {
        console.log("SUCCESS: Column 'memo' exists.");
    }
}

check();
