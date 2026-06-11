import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// Also try local .env if standard one fails or for local dev
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // Using Anon Key as per policy

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const csvPath = path.join(__dirname, '../src/data/y_ALL20251204.csv');

async function uploadDrugs() {
    try {
        console.log(`Reading CSV from ${csvPath}...`);
        const buffer = fs.readFileSync(csvPath);
        const decoded = iconv.decode(buffer, 'Shift_JIS');

        const records = parse(decoded, {
            columns: false,
            skip_empty_lines: true
        });

        console.log(`Total records parsed: ${records.length}`);

        // AI column is index 34
        const colIndex = 34;
        const drugsSet = new Set();

        records.forEach(row => {
            const name = row[colIndex];
            if (name && name.trim() !== '') {
                drugsSet.add(name.trim());
            }
        });

        const uniqueDrugs = Array.from(drugsSet).sort();
        console.log(`Unique drug names found: ${uniqueDrugs.length}`);

        // Check if table exists/is accessible
        const { error: checkError } = await supabase.from('medications').select('id').limit(1);
        if (checkError) {
            console.error('Error connecting to medications table. Did you run supabase_medications.sql?');
            console.error(checkError);
            return;
        }

        console.log('Uploading to Supabase (batch size 100)...');

        const BATCH_SIZE = 100;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < uniqueDrugs.length; i += BATCH_SIZE) {
            const batch = uniqueDrugs.slice(i, i + BATCH_SIZE).map(name => ({
                name: name
            }));

            const { error } = await supabase.from('medications').insert(batch);

            if (error) {
                console.error(`Error inserting batch ${i}:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += batch.length;
                if (i % 1000 === 0) process.stdout.write('.');
            }
        }

        console.log(`\nUpload complete.`);
        console.log(`Success: ${successCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (e) {
        console.error('Script Error:', e);
    }
}

uploadDrugs();
