import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'interface-hub.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS interfaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    description TEXT,
    category TEXT,
    tags TEXT,
    status TEXT DEFAULT 'draft',
    version TEXT DEFAULT '1.0.0',
    request_schema TEXT,
    response_schema TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS parameters (
    id TEXT PRIMARY KEY,
    interface_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    type TEXT NOT NULL,
    required INTEGER DEFAULT 0,
    description TEXT,
    example TEXT,
    FOREIGN KEY (interface_id) REFERENCES interfaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS data_models (
    name TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    description TEXT,
    schema TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fields (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    type TEXT NOT NULL,
    nullable INTEGER DEFAULT 1,
    primary_key INTEGER DEFAULT 0,
    default_value TEXT,
    comment TEXT,
    FOREIGN KEY (model_name) REFERENCES data_models(name) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS field_mappings (
    id TEXT PRIMARY KEY,
    interface_id TEXT NOT NULL,
    interface_field TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_field TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interface_id) REFERENCES interfaces(id) ON DELETE CASCADE,
    FOREIGN KEY (model_name) REFERENCES data_models(name) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_logs (
    id TEXT PRIMARY KEY,
    interface_id TEXT,
    method TEXT,
    path TEXT,
    request_body TEXT,
    response_body TEXT,
    status_code INTEGER,
    response_time INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    role TEXT DEFAULT 'developer',
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mock_configs (
    id TEXT PRIMARY KEY,
    interface_id TEXT,
    path TEXT NOT NULL,
    method TEXT DEFAULT 'GET',
    status_code INTEGER DEFAULT 200,
    delay INTEGER DEFAULT 0,
    response_config TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interface_id) REFERENCES interfaces(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_interfaces_status ON interfaces(status);
  CREATE INDEX IF NOT EXISTS idx_interfaces_category ON interfaces(category);
  CREATE INDEX IF NOT EXISTS idx_parameters_interface ON parameters(interface_id);
  CREATE INDEX IF NOT EXISTS idx_fields_model ON fields(model_name);
  CREATE INDEX IF NOT EXISTS idx_mappings_interface ON field_mappings(interface_id);
  CREATE INDEX IF NOT EXISTS idx_logs_interface ON api_logs(interface_id);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON api_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_mock_path ON mock_configs(path, method);
`);

export default db;
