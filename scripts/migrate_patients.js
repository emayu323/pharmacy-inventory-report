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
    console.error("Missing Env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log("Starting Migration...");

    // 1. Fetch all reports
    const { data: reports, error: fetchError } = await supabase
        .from('reports')
        .select('id, patient_name, patient_dob, patient_gender')
        .is('patient_id', null); // Only migrate ones not yet linked

    if (fetchError) {
        console.error("Error fetching reports:", fetchError);
        return;
    }

    if (!reports || reports.length === 0) {
        console.log("No unlinked reports found.");
        return;
    }

    console.log(`Found ${reports.length} unlinked reports.`);

    // 2. Identify Unique Patients
    const patientMap = new Map(); // Key: "Name|DOB", Value: { info: ..., reportIds: [] }

    reports.forEach(r => {
        const key = `${r.patient_name}|${r.patient_dob}`;
        if (!patientMap.has(key)) {
            patientMap.set(key, {
                name: r.patient_name,
                dob: r.patient_dob,
                gender: r.patient_gender,
                reportIds: []
            });
        }
        patientMap.get(key).reportIds.push(r.id);
    });

    console.log(`identified ${patientMap.size} unique patients.`);

    // 3. Insert or Get Patient, then Update Reports
    for (const [key, pData] of patientMap) {
        // Try to find existing patient first (idempotency)
        const { data: existing } = await supabase
            .from('patients')
            .select('id')
            .eq('name', pData.name)
            .eq('dob', pData.dob)
            .single();

        let patientId = existing?.id;

        if (!patientId) {
            // Create new patient
            const { data: newP, error: insertError } = await supabase
                .from('patients')
                .insert([{
                    name: pData.name,
                    dob: pData.dob,
                    gender: pData.gender,
                    kana: '' // We don't have this in reports, leave empty
                }])
                .select()
                .single();

            if (insertError) {
                console.error(`Error creating patient ${pData.name}:`, insertError.message);
                continue;
            }
            patientId = newP.id;
            console.log(`Created new patient: ${pData.name} (${patientId})`);
        } else {
            console.log(`Found existing patient: ${pData.name} (${patientId})`);
        }

        // 4. Update reports
        const { error: updateError } = await supabase
            .from('reports')
            .update({ patient_id: patientId })
            .in('id', pData.reportIds);

        if (updateError) {
            console.error(`Error updating reports for ${pData.name}:`, updateError.message);
        } else {
            console.log(`Linked ${pData.reportIds.length} reports to ${pData.name}.`);
        }
    }

    console.log("Migration Complete.");
}

migrate();
