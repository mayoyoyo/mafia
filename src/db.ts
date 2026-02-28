import { Database } from "bun:sqlite";
import path from "path";

const DB_PATH = path.join(import.meta.dir, "..", "mafia.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      passcode TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES users(id)
    );
  `);
}

export function createUser(username: string, passcode: string): number | null {
  const d = getDb();
  const existing = d.query("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return null;
  const result = d.query("INSERT INTO users (username, passcode) VALUES (?, ?)").run(username, passcode);
  return Number(result.lastInsertRowid);
}

export function loginUser(username: string, passcode: string): { id: number; username: string } | null {
  const d = getDb();
  const row = d.query("SELECT id, username FROM users WHERE username = ? AND passcode = ?").get(username, passcode) as any;
  return row ? { id: row.id, username: row.username } : null;
}

export function getUserById(id: number): { id: number; username: string } | null {
  const d = getDb();
  const row = d.query("SELECT id, username FROM users WHERE id = ?").get(id) as any;
  return row ? { id: row.id, username: row.username } : null;
}

export function saveConfig(adminId: number, name: string, settingsJson: string): number {
  const d = getDb();
  const result = d.query("INSERT INTO saved_configs (admin_id, name, settings_json) VALUES (?, ?, ?)").run(adminId, name, settingsJson);
  return Number(result.lastInsertRowid);
}

export function getConfigs(adminId: number): Array<{ id: number; admin_id: number; name: string; settings_json: string }> {
  const d = getDb();
  return d.query("SELECT id, admin_id, name, settings_json FROM saved_configs WHERE admin_id = ? ORDER BY created_at DESC").all(adminId) as any[];
}

export function deleteConfig(configId: number, adminId: number): boolean {
  const d = getDb();
  const result = d.query("DELETE FROM saved_configs WHERE id = ? AND admin_id = ?").run(configId, adminId);
  return result.changes > 0;
}

export function getConfig(configId: number): { id: number; admin_id: number; name: string; settings_json: string } | null {
  const d = getDb();
  return d.query("SELECT id, admin_id, name, settings_json FROM saved_configs WHERE id = ?").get(configId) as any;
}
