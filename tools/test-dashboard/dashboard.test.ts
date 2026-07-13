// tools/test-dashboard/dashboard.test.ts
//
// Self-contained unit tests for the dashboard's JUnit parser and the manifest
// classification. No game server is spawned. Run ONLY this file:
//   bun test tools/test-dashboard/dashboard.test.ts

import { describe, test, expect } from "bun:test";
import { parseJUnit } from "./runner.ts";
import { classify, isKnown, SERVER_FILES, FAST_FILES, POOL_SIZE } from "./manifest.ts";

const PASS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" failures="0" skipped="0" time="0.09">
  <testsuite name="tests/x.test.ts" file="tests/x.test.ts" tests="2">
    <testsuite name="group one" file="tests/x.test.ts" line="3" tests="2">
      <testcase name="a passes" classname="group one" time="0.001" file="tests/x.test.ts" line="4" />
      <testcase name="renders one &lt;rect&gt;" classname="group one" time="0.002" file="tests/x.test.ts" line="8" />
    </testsuite>
  </testsuite>
</testsuites>`;

const MIXED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" failures="1" skipped="1" time="0.01">
  <testsuite name="fail.test.ts" file="fail.test.ts" tests="3">
    <testcase name="passes ok" classname="" time="0" file="fail.test.ts" line="2" />
    <testcase name="fails here" classname="" time="0.002" file="fail.test.ts" line="3">
      <failure type="AssertionError" />
    </testcase>
    <testcase name="skipped one" classname="" time="0" file="fail.test.ts" line="4">
      <skipped />
    </testcase>
  </testsuite>
</testsuites>`;

const MSG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="m.test.ts">
    <testcase name="boom" classname="grp" time="0.5">
      <failure type="Error" message="expected 1 to be 2">at line 42
  in the stack</failure>
    </testcase>
  </testsuite>
</testsuites>`;

describe("parseJUnit", () => {
  test("parses passing self-closing testcases and decodes entities", () => {
    const r = parseJUnit(PASS_XML);
    expect(r.length).toBe(2);
    expect(r[0]).toMatchObject({ name: "a passes", suite: "group one", status: "passed" });
    expect(r[0].durationMs).toBe(1);
    expect(r[1].name).toBe("renders one <rect>"); // entity decoded
  });

  test("distinguishes passed / failed / skipped", () => {
    const r = parseJUnit(MIXED_XML);
    expect(r.map((t) => t.status)).toEqual(["passed", "failed", "skipped"]);
    expect(r[1].name).toBe("fails here");
  });

  test("failure with empty body still marks failed (message may be blank)", () => {
    const r = parseJUnit(MIXED_XML);
    const failed = r.find((t) => t.status === "failed")!;
    // bun often emits <failure type=... /> with no message; type is the fallback
    expect(failed.error).toBeDefined();
  });

  test("captures failure message attr + stack body when present", () => {
    const r = parseJUnit(MSG_XML);
    expect(r.length).toBe(1);
    expect(r[0].status).toBe("failed");
    expect(r[0].error).toContain("expected 1 to be 2");
    expect(r[0].error).toContain("line 42");
    expect(r[0].durationMs).toBe(500);
  });

  test("empty / garbage xml yields no results (no throw)", () => {
    expect(parseJUnit("")).toEqual([]);
    expect(parseJUnit("<nope/>")).toEqual([]);
  });
});

describe("manifest classification", () => {
  test("known server-spawning files are 'server'", () => {
    for (const f of SERVER_FILES) expect(classify(f)).toBe("server");
  });

  test("known fast files are 'fast'", () => {
    for (const f of FAST_FILES) expect(classify(f)).toBe("fast");
  });

  test("spot-check specific tricky classifications", () => {
    // audit called these 'engine-direct' but they DO spawn src/server.ts
    expect(classify("tests/golden-sequences.test.ts")).toBe("server");
    expect(classify("tests/structured-logging.test.ts")).toBe("server");
    // only mention src/server.ts in comments -> fast
    expect(classify("tests/invariants.test.ts")).toBe("fast");
    expect(classify("tests/night-action-teardown.test.ts")).toBe("fast");
    // quick `bun -e`, no WS server -> fast
    expect(classify("tests/db.test.ts")).toBe("fast");
    // playtest harness spawns a server
    expect(classify("tests/playtest/smoke.test.ts")).toBe("server");
  });

  test("unknown new files default to the safe 'server' bucket", () => {
    expect(classify("tests/brand-new-thing.test.ts")).toBe("server");
    expect(isKnown("tests/brand-new-thing.test.ts")).toBe(false);
    expect(isKnown("tests/db.test.ts")).toBe(true);
  });

  test("path normalization (backslashes / ./ prefix)", () => {
    expect(classify("./tests/db.test.ts")).toBe("fast");
    expect(classify("tests\\db.test.ts")).toBe("fast");
  });

  test("server and fast lists are disjoint", () => {
    const s = new Set(SERVER_FILES);
    for (const f of FAST_FILES) expect(s.has(f)).toBe(false);
  });

  test("pool sizes: fast wide, server narrow", () => {
    expect(POOL_SIZE.fast).toBeGreaterThan(POOL_SIZE.server);
    expect(POOL_SIZE.server).toBeGreaterThanOrEqual(1);
  });
});
