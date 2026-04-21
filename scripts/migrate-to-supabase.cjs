// scripts/migrate-to-supabase.cjs
// Chạy: node scripts/migrate-to-supabase.cjs
// Cần: SUPABASE_URL và SUPABASE_SERVICE_KEY trong process.env

const fs = require('fs')
const path = require('path')
const os = require('os')
const { createClient } = require('@supabase/supabase-js')

// QUAN TRỌNG: Dùng SERVICE KEY (không phải ANON KEY) để bypass RLS khi migrate
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Thiếu env vars: SUPABASE_URL và SUPABASE_SERVICE_KEY')
    console.error('Chạy: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrate-to-supabase.cjs')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Tìm file JSON (electron userData path)
// Windows: C:\Users\<user>\AppData\Roaming\k-map-house\phongtro_db.json
const DB_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'k-map-house', 'phongtro_db.json')

async function insertBatch(table, records, chunkSize = 50) {
    if (!records || records.length === 0) {
        console.log(`  [SKIP] ${table}: trống`)
        return
    }
    let success = 0
    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize)
        const { error } = await supabase.from(table).insert(chunk)
        if (error) {
            console.error(`  [ERROR] ${table} chunk ${i}: ${error.message}`)
            console.error('  Data mẫu:', JSON.stringify(chunk[0]).slice(0, 200))
        } else {
            success += chunk.length
        }
    }
    console.log(`  [OK] ${table}: ${success}/${records.length} records`)
}

async function migrate() {
    if (!fs.existsSync(DB_PATH)) {
        console.error(`Không tìm thấy file DB: ${DB_PATH}`)
        console.error('Thử tìm thủ công: mở app → Settings → "Đường dẫn DB"')
        process.exit(1)
    }

    console.log(`Đọc DB từ: ${DB_PATH}`)
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))

    // Thống kê
    console.log('\nThống kê dữ liệu cần migrate:')
    for (const [key, val] of Object.entries(db)) {
        if (Array.isArray(val)) console.log(`  ${key}: ${val.length} records`)
        else if (key !== 'users') console.log(`  ${key}: object`)
    }
    console.log('\nBắt đầu migrate...\n')

    // Thứ tự INSERT (quan trọng: cha trước, con sau)
    await insertBatch('service_zones', db.service_zones)
    await insertBatch('rooms', db.rooms)
    await insertBatch('tenants', db.tenants)
    await insertBatch('asset_templates', db.asset_templates)
    await insertBatch('contracts', db.contracts)
    await insertBatch('invoices', db.invoices)
    await insertBatch('move_in_receipts', db.move_in_receipts)
    await insertBatch('room_assets', db.room_assets)
    await insertBatch('room_asset_adjustments', db.room_asset_adjustments)
    await insertBatch('asset_snapshots', db.asset_snapshots)
    await insertBatch('room_vehicles', db.room_vehicles)
    await insertBatch('cash_transactions', db.cash_transactions)

    // KHÔNG migrate: users (giữ local) + app_settings (giữ local)

    console.log('\nMigrate hoàn tất!')
    console.log('Bước tiếp theo:')
    console.log('  1. Kiểm tra dữ liệu trên Supabase Dashboard')
    console.log('  2. Deploy bản app mới (với Supabase client)')
    console.log('  3. Test toàn bộ tính năng với data thật')
}

migrate().catch(err => {
    console.error('Migration thất bại:', err)
    process.exit(1)
})
