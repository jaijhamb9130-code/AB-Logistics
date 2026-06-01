
const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });

async function checkConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3308,
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'ab_logistics',
    });
    console.log('Successfully connected to the database.');
    await connection.end();
  } catch (error) {
    console.error('Failed to connect to the database:', error.message);
  }
}

checkConnection();
