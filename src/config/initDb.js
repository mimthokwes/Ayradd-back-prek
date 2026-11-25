const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SCHEMA_PATH = path.resolve(__dirname, '../../database/schema.sql');

/**
 * Ekstrak statement CREATE TABLE dari isi schema.sql
 */
function extractCreateTableStatements(schemaSql) {
  const withoutComments = schemaSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const createTables = [];
  for (const stmt of statements) {
    const match = stmt.match(
      /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?\s*\(/i
    );
    if (match) {
      createTables.push({
        tableName: match[1].toLowerCase(),
        sql: `${stmt};`,
      });
    }
  }
  return createTables;
}

/**
 * Inisialisasi otomatis tabel & seed data dari database/schema.sql
 * jika AUTO_INIT_DB=true:
 * - Jika database masih kosong -> jalankan seluruh schema.sql (tabel + seed).
 * - Jika database sudah ada -> cek tabel baru di schema.sql dan buat otomatis jika belum ada.
 */
async function initDbIfNeeded() {
  if (String(process.env.AUTO_INIT_DB || '').toLowerCase() !== 'true') {
    return;
  }

  const dbName = process.env.DB_NAME || 'prekduadara_db';
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    console.error(`❌ AUTO_INIT_DB dibatalkan: nama database '${dbName}' tidak valid.`);
    return;
  }

  if (!fs.existsSync(SCHEMA_PATH)) {
    console.warn(`⚠️ AUTO_INIT_DB dilewati: file schema tidak ditemukan di ${SCHEMA_PATH}`);
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`; USE \`${dbName}\`;`);

    const [existingRows] = await connection.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
      [dbName]
    );
    const existingTables = new Set(
      existingRows.map((r) => String(r.table_name || r.TABLE_NAME).toLowerCase())
    );

    const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    // Hapus CREATE DATABASE / USE hardcoded agar mengikuti DB_NAME dari environment
    const cleanedSchema = rawSchema
      .replace(/^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[^;]+;\s*$/gim, '')
      .replace(/^\s*USE\s+[^;]+;\s*$/gim, '');

    if (existingTables.size === 0) {
      await connection.query(cleanedSchema);
      console.log(`✅ AUTO_INIT_DB berhasil menginisialisasi skema & seed data ke '${dbName}'.`);
      return;
    }

    const createStatements = extractCreateTableStatements(cleanedSchema);
    const missingTables = createStatements.filter(
      (item) => !existingTables.has(item.tableName)
    );

    if (missingTables.length === 0) {
      console.log(`ℹ️ Database '${dbName}' sudah sinkron (${existingTables.size} tabel).`);
      return;
    }

    for (const item of missingTables) {
      await connection.query(item.sql);
      console.log(`✅ AUTO_INIT_DB membuat tabel baru: '${item.tableName}'.`);
    }
  } catch (error) {
    console.error('❌ Gagal menjalankan AUTO_INIT_DB:', error.message);
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

module.exports = {
  initDbIfNeeded,
};
