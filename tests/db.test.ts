import { describe, test, expect, beforeAll } from "bun:test";
import { getDb, createUser, loginUser, getUserById, saveLastSettings, getLastSettings } from "../src/db";

describe("Database", () => {
  beforeAll(() => {
    getDb(); // Initialize
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
});
