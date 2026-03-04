import { Database } from "bun:sqlite";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(import.meta.dir, "..", "mafia.db");

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

  // Migrations for player preferences
  try { db.exec("ALTER TABLE users ADD COLUMN hide_mafia_tag INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN player_color TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN last_settings_json TEXT DEFAULT NULL"); } catch {}
}

export function createUser(username: string, passcode: string): number | null {
  const d = getDb();
  const existing = d.query("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return null;
  const result = d.query("INSERT INTO users (username, passcode) VALUES (?, ?)").run(username, passcode);
  return Number(result.lastInsertRowid);
}

export function loginUser(username: string, passcode: string): { id: number; username: string; hide_mafia_tag: boolean; player_color: string | null } | null {
  const d = getDb();
  const row = d.query("SELECT id, username, hide_mafia_tag, player_color FROM users WHERE username = ? AND passcode = ?").get(username, passcode) as any;
  return row ? { id: row.id, username: row.username, hide_mafia_tag: !!row.hide_mafia_tag, player_color: row.player_color } : null;
}

export function getUserById(id: number): { id: number; username: string } | null {
  const d = getDb();
  const row = d.query("SELECT id, username FROM users WHERE id = ?").get(id) as any;
  return row ? { id: row.id, username: row.username } : null;
}

export function getUserPrefs(userId: number): { hide_mafia_tag: boolean; player_color: string | null } {
  const d = getDb();
  const row = d.query("SELECT hide_mafia_tag, player_color FROM users WHERE id = ?").get(userId) as any;
  return row ? { hide_mafia_tag: !!row.hide_mafia_tag, player_color: row.player_color } : { hide_mafia_tag: false, player_color: null };
}

export function updateUserPref(userId: number, key: "hide_mafia_tag" | "player_color", value: any): void {
  const d = getDb();
  if (key === "hide_mafia_tag") {
    d.query("UPDATE users SET hide_mafia_tag = ? WHERE id = ?").run(value ? 1 : 0, userId);
  } else if (key === "player_color") {
    d.query("UPDATE users SET player_color = ? WHERE id = ?").run(value, userId);
  }
}

export function saveLastSettings(userId: number, settingsJson: string): void {
  const d = getDb();
  d.query("UPDATE users SET last_settings_json = ? WHERE id = ?").run(settingsJson, userId);
}

export function getLastSettings(userId: number): string | null {
  const d = getDb();
  const row = d.query("SELECT last_settings_json FROM users WHERE id = ?").get(userId) as any;
  return row ? row.last_settings_json : null;
}
