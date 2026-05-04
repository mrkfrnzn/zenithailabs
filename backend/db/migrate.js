require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const { getDb } = require('./database');

function runMigration(db) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Use exec() which handles multi-statement SQL and PRAGMA correctly
  db.exec(schema);
}

function migrate() {
  const db = getDb();
  runMigration(db);
  console.log('Migration complete.');
}

module.exports = { runMigration };

if (require.main === module) migrate();
