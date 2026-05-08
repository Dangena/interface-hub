import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
const router = Router();
interface DatabaseConnection {
 id: string;
 name: string;
 type: 'mysql' | 'postgresql' | 'sqlite' | 'mssql';
 host: string;
 port: number;
 database: string;
 username: string;
 password?: string;
 path?: string;
 created_at: string;
}
router.get('/connections', (req, res) => {
 try {
 const connections = db.prepare('SELECT * FROM database_connections ORDER BY created_at DESC').all();
 res.json(connections);
 }
 catch (error) {
 res.status(500).json({ error: 'Failed to fetch connections' });
 }
});
router.post('/connections', (req, res) => {
 try {
 const { name, type, host, port, database, username, password, path } = req.body;
 const id = uuidv4();
 const now = new Date().toISOString();
 db.prepare(`
 INSERT INTO database_connections (id, name, type, host, port, database_name, username, password, path, created_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 `).run(id, name, type, host || '', port || 0, database, username, password || null, path || null, now);
 const connection = db.prepare('SELECT * FROM database_connections WHERE id = ?').get(id);
 res.status(201).json(connection);
 }
 catch (error) {
 res.status(500).json({ error: 'Failed to create connection' });
 }
});
router.delete('/connections/:id', (req, res) => {
 try {
 const { id } = req.params;
 db.prepare('DELETE FROM database_connections WHERE id = ?').run(id);
 res.json({ message: 'Connection deleted successfully' });
 }
 catch (error) {
 res.status(500).json({ error: 'Failed to delete connection' });
 }
});
router.post('/connections/:id/test', async (req, res) => {
 try {
 const { id } = req.params;
 const connection = db.prepare('SELECT * FROM database_connections WHERE id = ?').get(id) as any;
 if (!connection) {
 return res.status(404).json({ error: 'Connection not found' });
 }
 let success = false;
 let errorMessage = '';
 const type = connection.type;
 if (type === 'sqlite') {
 try {
 const sqlite3 = require('sqlite3');
 const dbPath = connection.path || ':memory:';
 const testDb = new sqlite3.Database(dbPath, (err: any) => {
 if (!err)
 success = true;
 else
 errorMessage = err.message;
 });
 testDb.close();
 }
 catch (err: any) {
 errorMessage = err.message;
 }
 }
 else if (type === 'mysql') {
 try {
 const mysql = require('mysql2/promise');
 const conn = await mysql.createConnection({
 host: connection.host,
 port: connection.port,
 user: connection.username,
 password: connection.password,
 database: connection.database_name,
 connectTimeout: 5000
 });
 await conn.end();
 success = true;
 }
 catch (err: any) {
 errorMessage = err.message;
 }
 }
 else if (type === 'postgresql') {
 try {
 const { Client } = require('pg');
 const client = new Client({
 host: connection.host,
 port: connection.port,
 user: connection.username,
 password: connection.password,
 database: connection.database_name,
 connectionTimeoutMillis: 5000
 });
 await client.connect();
 await client.end();
 success = true;
 }
 catch (err: any) {
 errorMessage = err.message;
 }
 }
 res.json({ success, error: errorMessage });
 }
 catch (error) {
 res.status(500).json({ error: 'Test connection failed' });
 }
});
router.post('/connections/:id/scan', async (req, res) => {
 try {
 const { id } = req.params;
 const connection = db.prepare('SELECT * FROM database_connections WHERE id = ?').get(id) as any;
 if (!connection) {
 return res.status(404).json({ error: 'Connection not found' });
 }
 const type = connection.type;
 let tables: any[] = [];
 if (type === 'sqlite') {
 try {
 const sqlite3 = require('sqlite3').verbose();
 const dbPath = connection.path || ':memory:';
 const testDb = new sqlite3.Database(dbPath);
 tables = await new Promise((resolve) => {
 const result: any[] = [];
 testDb.all("SELECT name FROM sqlite_master WHERE type='table'", (err: any, rows: any[]) => {
 if (!err && rows) {
 rows.forEach((row: any) => {
 if (row.name && !row.name.startsWith('sqlite_')) {
 result.push({ name: row.name });
 }
 });
 }
 resolve(result);
 });
 });
 for (const table of tables) {
 table.columns = await new Promise((resolve) => {
 testDb.all(`PRAGMA table_info(${table.name})`, (err: any, cols: any[]) => {
 if (!err && cols) {
 resolve(cols.map((c: any) => ({
 name: c.name,
 type: c.type,
 nullable: c.notnull === 0,
 primaryKey: c.pk === 1
 })));
 }
 else {
 resolve([]);
 }
 });
 });
 }
 testDb.close();
 }
 catch (err: any) {
 return res.status(500).json({ error: err.message });
 }
 }
 else if (type === 'mysql') {
 try {
 const mysql = require('mysql2/promise');
 const conn = await mysql.createConnection({
 host: connection.host,
 port: connection.port,
 user: connection.username,
 password: connection.password,
 database: connection.database_name
 });
 const [rows] = await conn.execute('SHOW TABLES');
 tables = rows.map((row: any) => ({ name: Object.values(row)[0] }));
 for (const table of tables) {
 const [columns] = await conn.execute(`DESCRIBE ${table.name}`);
 table.columns = columns.map((col: any) => ({
 name: col.Field,
 type: col.Type,
 nullable: col.Null === 'YES',
 primaryKey: col.Key === 'PRI'
 }));
 }
 await conn.end();
 }
 catch (err: any) {
 return res.status(500).json({ error: err.message });
 }
 }
 else if (type === 'postgresql') {
 try {
 const { Client } = require('pg');
 const client = new Client({
 host: connection.host,
 port: connection.port,
 user: connection.username,
 password: connection.password,
 database: connection.database_name
 });
 await client.connect();
 const result = await client.query(`
 SELECT table_name 
 FROM information_schema.tables 
 WHERE table_schema = 'public'
 `);
 tables = result.rows.map((row: any) => ({ name: row.table_name }));
 for (const table of tables) {
 const colResult = await client.query(`
 SELECT column_name, data_type, is_nullable 
 FROM information_schema.columns 
 WHERE table_name = $1
 `, [table.name]);
 table.columns = colResult.rows.map((col: any) => ({
 name: col.column_name,
 type: col.data_type,
 nullable: col.is_nullable === 'YES',
 primaryKey: false
 }));
 }
 await client.end();
 }
 catch (err: any) {
 return res.status(500).json({ error: err.message });
 }
 }
 res.json({ tables, connectionId: id });
 }
 catch (error) {
 res.status(500).json({ error: 'Scan failed' });
 }
});
router.post('/connections/:id/import', async (req, res) => {
 try {
 const { id } = req.params;
 const { tables } = req.body;
 const connection = db.prepare('SELECT * FROM database_connections WHERE id = ?').get(id) as any;
 if (!connection) {
 return res.status(404).json({ error: 'Connection not found' });
 }
 const now = new Date().toISOString();
 const importedModels: string[] = [];
 for (const table of tables) {
 const existingModel = db.prepare('SELECT * FROM data_models WHERE table_name = ?').get(table.name);
 if (existingModel) {
 continue;
 }
 db.prepare(`
 INSERT INTO data_models (name, table_name, description, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?)
 `).run(table.name, table.name, `Auto imported from ${connection.name}`, now, now);
 importedModels.push(table.name);
 for (const column of table.columns) {
 db.prepare(`
 INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, comment)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
 `).run(uuidv4(), table.name, column.name, column.name, column.type, column.nullable ? 1 : 0, column.primaryKey ? 1 : 0, `Auto imported`);
 }
 }
 res.json({ success: true, importedModels, count: importedModels.length });
 }
 catch (error) {
 res.status(500).json({ error: 'Import failed' });
 }
});
export default router;
