import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const pharmacists = [
    '山田 太郎',
    '佐藤 花子',
    '鈴木 一郎',
    '高橋 次郎'
]

async function seedPharmacists() {
    console.log('Seeding pharmacists...')

    for (const name of pharmacists) {
        const { error } = await supabase
            .from('pharmacists')
            .insert([{ name }])

        if (error) {
            console.error(`Error inserting ${name}:`, error)
        } else {
            console.log(`Inserted ${name}`)
        }
    }
}

seedPharmacists()
