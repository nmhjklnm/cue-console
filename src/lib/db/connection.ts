import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const DB_PATH = join(homedir(), ".cue", "cue.db");

let db: Database.Database | null = null;
let lastCheckpoint = 0;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(join(homedir(), ".cue"), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("wal_autocheckpoint = 1000");
    
    const { initTables } = require("./schema");
    initTables(db);
  }

  const now = Date.now();
  if (now - lastCheckpoint > 60000) {
    lastCheckpoint = now;
    try {
      db.pragma("wal_checkpoint(PASSIVE)");
    } catch {
      // ignore checkpoint errors
    }
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
}
