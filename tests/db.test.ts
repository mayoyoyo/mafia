import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "fs";
import os from "os";
import path from "path";

// D7/B0c: src/db reads DATABASE_PATH once at module load (src/db.ts:4) and
// falls back to the repo-root mafia.db when unset. Static imports are hoisted
// ahead of any top-level statements, so the env var must be set here and
// src/db loaded via dynamic import below — otherwise this suite writes the
// dev database.
const TEST_DB_PATH = path.join(os.tmpdir(), `mafia-db-test-unit-${Date.now()}-${process.pid}.db`);
process.env.DATABASE_PATH = TEST_DB_PATH;

const { getDb, createUser, loginUser, getUserById, saveLastSettings, getLastSettings } =
  await import("../src/db");

describe("Database", () => {
  beforeAll(() => {
    getDb(); // Initialize
  });

  afterAll(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(TEST_DB_PATH + suffix, { force: true });
    }
  });

  test("creates a user", () => {
    const id = createUser("testuser_" + Date.now(), "1234");
    expect(id).not.toBeNull();
    expect(typeof id).toBe("number");
  });

  test("rejects duplicate username", () => {
    const name = "dupuser_" + Date.now();
    createUser(name, "1234");
    const id2 = createUser(name, "5678");
    expect(id2).toBeNull();
  });

  test("login with correct credentials", () => {
    const name = "logintest_" + Date.now();
    createUser(name, "9999");
    const user = loginUser(name, "9999");
    expect(user).not.toBeNull();
    expect(user!.username).toBe(name);
  });

  test("login fails with wrong passcode", () => {
    const name = "wrongpass_" + Date.now();
    createUser(name, "1111");
    const user = loginUser(name, "2222");
    expect(user).toBeNull();
  });

  test("getUserById works", () => {
    const name = "byid_" + Date.now();
    const id = createUser(name, "4444")!;
    const user = getUserById(id);
    expect(user).not.toBeNull();
    expect(user!.username).toBe(name);
  });

  test("save and retrieve last settings", () => {
    const name = "settingsuser_" + Date.now();
    const userId = createUser(name, "5555")!;
    const settings = JSON.stringify({ mafiaCount: 2, enableDoctor: true });
    saveLastSettings(userId, settings);

    const retrieved = getLastSettings(userId);
    expect(retrieved).not.toBeNull();
    expect(JSON.parse(retrieved!).mafiaCount).toBe(2);
    expect(JSON.parse(retrieved!).enableDoctor).toBe(true);
  });

  test("getLastSettings returns null for new user", () => {
    const name = "newuser_" + Date.now();
    const userId = createUser(name, "6666")!;
    const result = getLastSettings(userId);
    expect(result).toBeNull();
  });

  test("saved_configs table does not exist after init (L10)", () => {
    const d = getDb();
    const row = d
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_configs'")
      .get();
    expect(row).toBeNull();
  });

  test("init drops a pre-existing saved_configs table (L10)", () => {
    const tmpPath = path.join(os.tmpdir(), `mafia-db-test-${Date.now()}-${process.pid}.db`);
    // Seed a DB file containing the legacy table (simulates a deployed volume)
    const seed = new Database(tmpPath, { create: true });
    seed.exec("CREATE TABLE saved_configs (id INTEGER PRIMARY KEY)");
    seed.close();

    // src/db caches DATABASE_PATH at import, so run the real init path in a subprocess
    const proc = Bun.spawnSync({
      cmd: ["bun", "-e", 'import { getDb } from "./src/db"; getDb();'],
      cwd: path.join(import.meta.dir, ".."),
      env: { ...process.env, DATABASE_PATH: tmpPath },
    });
    expect(proc.exitCode).toBe(0);

    const check = new Database(tmpPath);
    const row = check
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_configs'")
      .get();
    check.close();
    expect(row).toBeNull();

    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(tmpPath + suffix, { force: true });
    }
  });
});
