import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import iconv from 'iconv-lite';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase URL or Key in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_PATH = 'src/data/y_ALL20251204.csv';

// Approximate CSV structure based on user info & inspection
// Column 34 (0-based) is "AI" (Medication Name)
// Column 4 or 5 is "Code"? In Python inspection: Col 5 (index 4) seemed like code but had garbage chars due to print?
// Let's rely on index 34 for Name.
// We can try to get YI Code if we know the index. The previous `head` output showed col 31 as '5100133A1011' etc for YI code likely?
// Let's inspect column 30 or 31 later if needed. For now, name is priority.

// Wait, the previous head check in Python:
// Col 35 (AI): ガスター散２％ (Index 34)
// Let's check YI Code location. Likely column 31 (Index 30) or 32 (Index 31).
// The CSV sample showed:
// ..., "20250401","99999999","2325003B2029","001425000", ...
// Count from end?
// Let's just grab the Name (Index 34) for now as requested.

const NAME_COL_INDEX = 34;
const CODE_COL_INDEX = 30; // Heuristic guess based on typical YJ code format seen in output

async function importData() {
    console.log('Starting import...');

    const results = [];

    // Create stream with iconv decoding
    const fileStream = fs.createReadStream(CSV_PATH)
        .pipe(iconv.decodeStream('Shift_JIS'));

    const parser = fileStream.pipe(parse({
        delimiter: ',',
        from_line: 1, // No header in this CSV based on inspection? Or verified?
        // The first line in `head` output looked like data: "0","Y","610406079", ...
        // So no header.
        relax_column_count: true
    }));

    let records = [];
    let count = 0;

    for await (const record of parser) {
        const name = record[NAME_COL_INDEX];
        const code = record[CODE_COL_INDEX]; // Optional

        if (name) {
            records.push({
                name: name,
                yi_code: code || null
            });
        }

        if (records.length >= 1000) {
            await insertBatch(records);
            count += records.length;
            console.log(`Imported ${count} records...`);
            records = [];
        }
    }

    if (records.length > 0) {
        await insertBatch(records);
        count += records.length;
    }

    console.log(`Import completed. Total ${count} records.`);
}

async function insertBatch(rows) {
    const { error } = await supabase
        .from('medications')
        .insert(rows);

    if (error) {
        console.error('Error inserting batch:', error);
        // Don't exit, try to continue? Or exit?
        // process.exit(1); 
    }
}

importData().catch(err => console.error(err));
