import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceArg = process.argv[2] || 'src/data/y_ALL20260522.csv';
const sourcePath = path.resolve(projectRoot, sourceArg);
const outputPath = path.resolve(projectRoot, 'src/data/drug-master.generated.json');

const NAME_COL_INDEX = 34;
const KANA_COL_INDEX = 6;
const UNIT_COL_INDEX = 9;

if (!fs.existsSync(sourcePath)) {
    console.error(`CSV not found: ${sourcePath}`);
    process.exit(1);
}

const decoded = iconv.decode(fs.readFileSync(sourcePath), 'Shift_JIS');
const records = parse(decoded, {
    columns: false,
    relax_column_count: true,
    skip_empty_lines: true
});

const byKey = new Map();

for (const row of records) {
    const name = String(row[NAME_COL_INDEX] || '').trim();
    if (!name) continue;

    const kana = String(row[KANA_COL_INDEX] || '').trim();
    const unit = String(row[UNIT_COL_INDEX] || '').trim();
    const key = `${name}\u0000${unit}`;

    if (!byKey.has(key)) {
        byKey.set(key, { name, kana, unit });
    }
}

const entries = Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ja') || a.unit.localeCompare(b.unit, 'ja')
);

const payload = {
    source: path.relative(projectRoot, sourcePath),
    columns: {
        name: NAME_COL_INDEX,
        kana: KANA_COL_INDEX,
        unit: UNIT_COL_INDEX
    },
    entries
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${entries.length} drug master entries to ${path.relative(projectRoot, outputPath)}`);
