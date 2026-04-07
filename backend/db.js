const mysql = require("mysql2");

const {
  DB_HOST,
  DB_PORT,
  DB_USER = "root",
  DB_PASSWORD = "Root1234!",
  DB_NAME = "marsa_ai",
  DB_SOCKET_PATH = "/tmp/mysql.sock",
} = process.env;

const connectionConfig = {
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
};

if (DB_HOST) {
  connectionConfig.host = DB_HOST;
  connectionConfig.port = Number(DB_PORT) || 3306;
} else {
  connectionConfig.socketPath = DB_SOCKET_PATH;
}

const db = mysql.createConnection(connectionConfig);

db.connect((err) => {
  if (err) {
    console.error("MySQL connection failed:", err.message);
    console.error("MySQL connection error details:", err);
    return;
  }
  console.log("Connected to MySQL");
});

module.exports = db;
