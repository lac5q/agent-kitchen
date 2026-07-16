import assert from "node:assert/strict";
import test from "node:test";
import { jobs, renderJob } from "./install-runtime-services.mjs";

test("runtime services includes fathom-sync on a 3h cadence", () => {
  const fathom = jobs.find((job) => job.label === "com.memroos.fathom-sync");
  assert.ok(fathom, "expected com.memroos.fathom-sync job");
  assert.equal(fathom.interval, 10800);
  assert.ok(fathom.args.join(" ").includes("fathom-sync.sh"));
});

test("fathom-sync plist points at meet-recordings sync script and logs", () => {
  const fathom = jobs.find((job) => job.label === "com.memroos.fathom-sync");
  const plist = renderJob(fathom);
  assert.match(plist, /com\.memroos\.fathom-sync/);
  assert.match(plist, /fathom-sync\.sh/);
  assert.match(plist, /StartInterval/);
  assert.match(plist, /<integer>10800<\/integer>/);
  assert.match(plist, /fathom-sync\.log/);
  assert.match(plist, /MEMROOS_ROOT/);
});

test("context-health job remains installed", () => {
  const health = jobs.find((job) => job.label === "com.memroos.context-health");
  assert.ok(health);
  assert.equal(health.interval, 900);
});
