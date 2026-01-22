import type Database from "better-sqlite3";

export function initTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      agent_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE,
      agent_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE,
      response_json TEXT NOT NULL,
      cancelled INTEGER NOT NULL,
      created_at DATETIME NOT NULL,
      FOREIGN KEY (request_id) REFERENCES cue_requests(request_id)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sha256 TEXT UNIQUE NOT NULL,
      file TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_response_files (
      response_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      PRIMARY KEY (response_id, idx)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_enabled_conversations (
      conv_type TEXT NOT NULL,
      conv_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (conv_type, conv_id)
    )
  `);

  const versionRow = database
    .prepare(`SELECT value FROM schema_meta WHERE key = ?`)
    .get("schema_version") as { value?: string } | undefined;
  const version = String(versionRow?.value ?? "");
  if (version !== "3") {
    const reqCountRow = database.prepare(`SELECT COUNT(*) as n FROM cue_requests`).get() as { n: number };
    const respCountRow = database.prepare(`SELECT COUNT(*) as n FROM cue_responses`).get() as { n: number };
    const reqCount = Number(reqCountRow?.n ?? 0);
    const respCount = Number(respCountRow?.n ?? 0);
    if (reqCount === 0 && respCount === 0) {
      database
        .prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)`)
        .run("schema_version", "3");
    } else {
      throw new Error(
        "Database schema is outdated (pre-file storage). Please migrate: cueme migrate\n" +
          "数据库结构已过期（旧的 base64 存储）。请先执行：cueme migrate"
      );
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, agent_name),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS conversation_meta (
      key TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at DATETIME,
      deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at DATETIME
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS conversation_pins (
      conv_type TEXT NOT NULL,
      conv_id TEXT NOT NULL,
      view TEXT NOT NULL,
      pin_order INTEGER PRIMARY KEY AUTOINCREMENT,
      pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(conv_type, conv_id, view)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS worker_leases (
      lease_key TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_envs (
      agent_id TEXT PRIMARY KEY,
      agent_runtime TEXT,
      project_dir TEXT,
      agent_terminal TEXT,
      updated_at DATETIME
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS cue_message_queue (
      id TEXT PRIMARY KEY,
      conv_type TEXT NOT NULL,
      conv_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      message_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at DATETIME NOT NULL,
      locked_by TEXT,
      locked_at DATETIME,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cue_message_queue_conv
    ON cue_message_queue (conv_type, conv_id, position)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cue_message_queue_due
    ON cue_message_queue (status, next_run_at)
  `);
}
