const { dbQuery } = require("../utils/dbQuery");

async function findAdminByCredentials(email, password) {
  const rows = await dbQuery(
    `SELECT id, full_name, email, 'admin' AS role
     FROM admins
     WHERE email = ? AND password_hash = ?
     LIMIT 1`,
    [email, password]
  );
  return rows[0] || null;
}

module.exports = { findAdminByCredentials };

