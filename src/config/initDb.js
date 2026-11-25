const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SCHEMA_PATH = path.resolve(__dirname, '../../database/schema.sql');

/**
 * Inisialisasi otomatis tabel & seed data dari database/schema.sql
 * jika AUTO_INIT_DB=true dan tabel `users` belum tersedia.
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

    const [tables] = await connection.query(
      'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
      [dbName, 'users']
    );

    if (tables[0].count > 0) {
      console.log(`ℹ️ Database '${dbName}' sudah terinisialisasi, melewati AUTO_INIT_DB.`);
      return;
    }

    const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    // Hapus CREATE DATABASE / USE hardcoded agar mengikuti DB_NAME dari environment
    const cleanedSchema = rawSchema
      .replace(/^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[^;]+;\s*$/gim, '')
      .replace(/^\s*USE\s+[^;]+;\s*$/gim, '');

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`; USE \`${dbName}\`;\n${cleanedSchema}`);
    console.log(`✅ AUTO_INIT_DB berhasil menginisialisasi skema & seed data ke '${dbName}'.`);
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
