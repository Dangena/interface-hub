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

  CREATE TABLE IF NOT EXISTS database_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    host TEXT,
    port INTEGER,
    database_name TEXT,
    username TEXT,
    password TEXT,
    path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

db.exec(`
  CREATE TABLE IF NOT EXISTS change_history (
    id TEXT PRIMARY KEY,
    interface_id TEXT NOT NULL,
    action TEXT NOT NULL,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    operator TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interface_id) REFERENCES interfaces(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_change_history_interface ON change_history(interface_id);
  CREATE INDEX IF NOT EXISTS idx_change_history_created ON change_history(created_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS interface_versions (
    id TEXT PRIMARY KEY,
    interface_id TEXT NOT NULL,
    version TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    description TEXT,
    operator TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interface_id) REFERENCES interfaces(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_interface_versions_interface ON interface_versions(interface_id);
  CREATE INDEX IF NOT EXISTS idx_interface_versions_created ON interface_versions(created_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    requester_id TEXT NOT NULL,
    requester_name TEXT,
    reviewer_id TEXT,
    reviewer_name TEXT,
    review_comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
  CREATE INDEX IF NOT EXISTS idx_approvals_requester ON approvals(requester_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ci_cd_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    trigger_type TEXT NOT NULL,
    trigger_data TEXT,
    result TEXT,
    started_at DATETIME,
    finished_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES ci_cd_configs(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_config ON pipeline_runs(config_id);
  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    read INTEGER DEFAULT 0,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    operation_name TEXT NOT NULL,
    service_name TEXT DEFAULT 'interface-hub',
    method TEXT,
    path TEXT,
    status_code INTEGER,
    duration INTEGER,
    tags TEXT,
    logs TEXT,
    user_id TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(trace_id);
  CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at);
  CREATE INDEX IF NOT EXISTS idx_traces_operation ON traces(operation_name);
`);

export default db;
