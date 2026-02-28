import { describe, test, expect, beforeAll } from "bun:test";
import { getDb, createUser, loginUser, getUserById, saveConfig, getConfigs, deleteConfig, getConfig } from "../src/db";

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

  test("save and retrieve config", () => {
    const name = "configuser_" + Date.now();
    const userId = createUser(name, "5555")!;
    const settings = JSON.stringify({ mafiaCount: 2, enableDoctor: true });
    const configId = saveConfig(userId, "Test Config", settings);

    const configs = getConfigs(userId);
    expect(configs.length).toBeGreaterThanOrEqual(1);
    const found = configs.find((c) => c.id === configId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Test Config");
    expect(JSON.parse(found!.settings_json).mafiaCount).toBe(2);
  });

  test("delete config", () => {
    const name = "delconfig_" + Date.now();
    const userId = createUser(name, "6666")!;
    const configId = saveConfig(userId, "ToDelete", "{}");
    const deleted = deleteConfig(configId, userId);
    expect(deleted).toBe(true);
    const config = getConfig(configId);
    expect(config).toBeNull();
  });

  test("cannot delete another user's config", () => {
    const name1 = "owner_" + Date.now();
    const name2 = "other_" + Date.now();
    const userId1 = createUser(name1, "7777")!;
    const userId2 = createUser(name2, "8888")!;
    const configId = saveConfig(userId1, "Private", "{}");
    const deleted = deleteConfig(configId, userId2);
    expect(deleted).toBe(false);
  });
});
