const mysql = require("mysql2");

const {
  DB_HOST = "127.0.0.1",
  DB_PORT,
  DB_USER = "root",
  DB_PASSWORD = "Root1234!",
  DB_NAME = "marsa_ai",
} = process.env;

const connectionConfig = {
  host: DB_HOST,
  port: Number(DB_PORT) || 3306,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const db = mysql.createPool(connectionConfig);

db.getConnection((err, connection) => {
  if (err) {
    console.error("MySQL pool initialization failed:", err.message);
    console.error("MySQL pool initialization details:", err);
    return;
  }
  console.log("Connected to MySQL (pool)");
  connection.release();
});

module.exports = db;
