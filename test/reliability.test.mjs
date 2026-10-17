// Tool-response reliability audit (2026-10-17) fixes: unconfirmed manufacturer, stale or failed Digi-Key refresh,
// lifecycle "unknown" vs a stated status, silent Mouser fuzzy matches, Newark format drift, version and timestamps.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { classifyLifecycle, lifecycleFields } from "../src/lifecycle.js";
import { normalizeMouser } from "../src/mouser.js";
import { normalizeNewark, stockNumber } from "../src/newark.js";
import { normalizeDigikey } from "../src/digikey.js";
import { mfrKey } from "../src/core.js";

const SERVER = fileURLToPath(new URL("../src/index.js", import.meta.url));
let mock, base, mode = {};
const dkProduct = (mfr, pn, stock, status = "Active", mpn = "LM358DR") => ({ Manufacturer: { Name: mfr }, ManufacturerProductNumber: mpn, QuantityAvailable: stock, ProductStatus: { Status: status }, ProductVariations: [{ DigiKeyProductNumber: pn, PackageType: { Name: "Cut Tape (CT)" }, QuantityAvailableforPackageType: stock, MinimumOrderQuantity: 1, StandardPricing: [{ BreakQuantity: 1, UnitPrice: pn.startsWith("296-") ? 0.27 : 0.05 }] }] });

before(async () => {
  mock = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const send = (code, obj, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
      if (req.url.startsWith("/mouser")) {
        if (mode.mouser === "ratelimit") return send(403, { Errors: [{ Code: "TooManyRequests", Message: "Maximum calls per minute exceeded.", ResourceKey: "MaxCallPerMinute" }] });
        if (mode.mouser === "loose") return send(200, { Errors: [], SearchResults: { Parts: [{ MouserPartNumber: "667-ERJ3EKF1002V", ManufacturerPartNumber: "ERJ3EKF1002V", Manufacturer: "Panasonic", AvailabilityInStock: "100", PriceBreaks: [] }] } });
        if (mode.mouser === "empty") return send(200, { Errors: [], SearchResults: { Parts: [] } });
        return send(200, { Errors: [], SearchResults: { Parts: [{ MouserPartNumber: "595-LM358DR", ManufacturerPartNumber: "LM358DR", Manufacturer: "Texas Instruments", AvailabilityInStock: "49194", PriceBreaks: [{ Quantity: 1, Price: "$0.26", Currency: "USD" }] }] } });
      }
      if (req.url.startsWith("/newark")) {
        if (mode.newark === "drift") return send(200, { somethingNew: { items: [] } });
        return send(200, { manufacturerPartNumberSearchReturn: { numberOfResults: 0, products: [] } });
      }
      if (req.url.startsWith("/dk/v1/oauth2/token")) return send(200, { access_token: "t", expires_in: 600 });
      if (req.url.includes("-ND/productdetails")) {
        if (mode.dkrefresh === "fail") return send(500, { error: "boom" });
        if (mode.dkrefresh === "ratelimit") return send(429, {}, { "retry-after": "30" });
        const dk = decodeURIComponent(req.url.split("/search/")[1].split("/")[0]);
        return send(200, { Product: dk.startsWith("296-") ? dkProduct("Texas Instruments", dk, 85321) : dkProduct("UMW", dk, 90000) });
      }
      if (req.url.includes("/productdetails")) return send(404, {});
      if (req.url.includes("/search/keyword")) return send(200, { Products: [dkProduct("UMW", "4518-LM358DR-ND", 90000), dkProduct("Texas Instruments", "296-1395-1-ND", 5112)] });
      send(404, {});
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${mock.address().port}`;
});
after(() => mock.close());

async function callTool(name, args) {
  const env = { ...process.env, MOUSER_API_KEY: "k", NEWARK_API_KEY: "k", DIGIKEY_CLIENT_ID: "i", DIGIKEY_CLIENT_SECRET: "s", MOUSER_API_BASE: `${base}/mouser`, NEWARK_API_BASE: `${base}/newark`, DIGIKEY_API_BASE: `${base}/dk` };
  const c = new Client({ name: "test", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env }));
  try { const r = await c.callTool({ name, arguments: args }); return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text); } finally { await c.close(); }
}

test("lifecycle: only a stated status counts; empty Mouser field and Newark stocking status are unknown", () => {
  assert.equal(classifyLifecycle(null, { distributor: "Mouser" }), "unknown");
  assert.equal(classifyLifecycle("", { distributor: "Mouser" }), "unknown");
  assert.equal(classifyLifecycle("New Product", { distributor: "Mouser" }), "active");
  assert.equal(classifyLifecycle("Active", { distributor: "Digi-Key" }), "active");
  assert.equal(classifyLifecycle("Not For New Designs", { distributor: "Digi-Key" }), "nrnd");
  assert.equal(classifyLifecycle("Last Time Buy", { distributor: "Digi-Key" }), "eol");
  assert.equal(classifyLifecycle("STOCKED", { distributor: "Newark" }), "unknown");
  assert.equal(classifyLifecycle("NO_LONGER_MANUFACTURED", { distributor: "Newark" }), "eol");
  assert.deepEqual(lifecycleFields(null, "Mouser"), { lifecycleStatus: "unknown", lifecycleStated: false, cleanLifecycleCheck: false });
  // BAS116LT1G-style Mouser record: no LifecycleStatus, not discontinued -> unknown, not a clean check
  const m = normalizeMouser({ MouserPartNumber: "863-BAS116LT1G", ManufacturerPartNumber: "BAS116LT1G", Manufacturer: "onsemi", AvailabilityInStock: "21733", PriceBreaks: [] });
  assert.equal(m.lifecycleStatus, "unknown");
  assert.equal(m.cleanLifecycleCheck, false);
  // Digi-Key "Active" but flagged Discontinued -> eol
  const d = normalizeDigikey({ ...dkProduct("onsemi", "BAS116LT1GOSCT-ND", 1), Discontinued: true });
  assert.equal(d.lifecycleStatus, "eol");
});

test("Newark: unparseable stock is null, not 0", () => {
  assert.equal(stockNumber("Call"), null);
  assert.equal(stockNumber(""), null);
  assert.equal(stockNumber("1,234"), 1234);
  assert.equal(normalizeNewark({ sku: "1", stock: { level: "n/a" } }).stock, null);
  assert.equal(normalizeNewark({ sku: "1", productStatus: "STOCKED" }).lifecycleStatus, "unknown");
});

test("manufacturer aliases: ON Semiconductor and onsemi are the same maker", () => {
  assert.equal(mfrKey("ON Semiconductor"), mfrKey("onsemi"));
  assert.equal(mfrKey("Texas Instruments"), mfrKey("TEXAS INSTRUMENTS"));
});

test("MCP: clone pick with no second distributor answering is marked manufacturer NOT confirmed", async () => {
  mode = { mouser: "ratelimit" };
  const r = await callTool("get_part_details", { partNumber: "LM358DR", distributors: ["digikey", "mouser"] });
  assert.equal(r.results.digikey.manufacturer, "UMW"); // stock ranking alone picks the clone
  assert.equal(r.results.digikey.manufacturerConfirmed, false);
  assert.match(r.notes.join(" "), /Manufacturer NOT confirmed/);
  assert.match(r.notes.join(" "), /Mouser rate limit/);
  assert.ok(r.warnings.some((w) => /manufacturer not confirmed/.test(w)));
  assert.match(r.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(r.plugin.version, "0.2.0");
});

test("MCP: Digi-Key-only call on a multi-maker part is also unconfirmed", async () => {
  mode = {};
  const r = await callTool("get_part_details", { partNumber: "LM358DR", distributors: ["digikey"] });
  assert.equal(r.results.digikey.manufacturerConfirmed, false);
});

test("MCP: when Mouser answers, Digi-Key switches to TI and is confirmed; cheapest excludes the clone", async () => {
  mode = {};
  const r = await callTool("compare_distributors", { partNumber: "LM358DR", quantities: [1], distributors: ["digikey", "mouser"] });
  const dk = r.rows.find((x) => x.distributor === "Digi-Key");
  assert.equal(dk.manufacturer, "Texas Instruments");
  assert.equal(dk.manufacturerConfirmed, true);
  assert.equal(dk.stock, 85321); // refreshed, not the stale 5112 from keyword search
  assert.equal(dk.stockFresh, true);
  assert.equal(dk.lifecycleStatus, "active");
  const mo = r.rows.find((x) => x.distributor === "Mouser");
  assert.equal(mo.lifecycleStatus, "unknown");
  assert.equal(mo.cleanLifecycleCheck, false);
  assert.deepEqual(r.lifecycleSummary.cleanChecks, ["Digi-Key"]);
  assert.ok(r.flags.some((f) => /Mouser: lifecycle not stated/.test(f)));
});

test("MCP: a failed Digi-Key refresh is flagged stale and the row can't win cheapest-in-stock", async () => {
  mode = { dkrefresh: "fail", mouser: "empty" };
  const r = await callTool("compare_distributors", { partNumber: "LM358DR", quantities: [1], distributors: ["digikey", "mouser"] });
  const dk = r.rows.find((x) => x.distributor === "Digi-Key");
  assert.equal(dk.stockFresh, false);
  assert.match(dk.stockNote, /refresh failed/);
  assert.equal(typeof r.cheapestInStock[1], "string"); // nothing qualifies
  assert.ok(r.flags.some((f) => /stock may be stale/.test(f)));
});

test("MCP: a rate limit during the Digi-Key refresh is reported, not hidden", async () => {
  mode = { dkrefresh: "ratelimit" };
  const r = await callTool("get_part_details", { partNumber: "LM358DR", distributors: ["digikey"] });
  assert.equal(r.results.digikey, undefined);
  assert.match(r.notes.join(" "), /Digi-Key error: Digi-Key rate limit reached; retry after 30 s/);
  assert.doesNotMatch(r.notes.join(" "), /rejected/);
});

test("MCP: Digi-Key keyword-search stock is marked indicative", async () => {
  mode = {};
  const r = await callTool("search_parts", { keyword: "LM358DR", distributors: ["digikey"] });
  assert.ok(r.results.digikey.length > 0);
  assert.ok(r.results.digikey.every((x) => x.stockFresh === false && /stale/.test(x.stockNote)));
  assert.ok(r.retrievedAt);
});

test("MCP: Mouser punctuation-blind match is not silent", async () => {
  mode = { mouser: "loose" };
  const r = await callTool("get_part_details", { partNumber: "ERJ-3EKF1002V", distributors: ["mouser"] });
  assert.equal(r.results.mouser.exactMatch, false);
  assert.match(r.results.mouser.matchNote, /punctuation is ignored/);
  assert.ok(r.warnings.some((w) => /not an exact part-number match/.test(w)));
});

test("MCP: a Newark response without the results wrapper is an error, not 'no match'", async () => {
  mode = { newark: "drift" };
  const r = await callTool("get_part_details", { partNumber: "LM358DR", distributors: ["newark"] });
  const n = r.notes.join(" ");
  assert.match(n, /Newark error: Newark returned a response in an unexpected format/);
  assert.doesNotMatch(n, /Newark: no match for/);
});

test("MCP: sourcing_status reports version and git commit", async () => {
  const r = await callTool("sourcing_status", {});
  assert.equal(r.version, "0.2.0");
  assert.match(r.gitSha, /^[0-9a-f]{40}$|^unknown$/);
  assert.ok(r.retrievedAt);
});

test("version: gitSha is read from the npx lockfile that installed the package", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ver-"));
  const pkgDir = join(dir, "node_modules", "parts-sourcing-mcp");
  mkdirSync(join(pkgDir, "src"), { recursive: true });
  const sha = "0123456789abcdef0123456789abcdef01234567";
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ packages: { "node_modules/parts-sourcing-mcp": { resolved: `git+ssh://git@github.com/liminal-photonics/parts-sourcing-plugin.git#${sha}` } } }));
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "parts-sourcing-mcp", version: "9.9.9" }));
  const src = (await import("node:fs")).readFileSync(fileURLToPath(new URL("../src/version.js", import.meta.url)), "utf8");
  writeFileSync(join(pkgDir, "src", "version.js"), src);
  const { pluginVersion } = await import(join(pkgDir, "src", "version.js"));
  assert.deepEqual(pluginVersion(), { name: "parts-sourcing-mcp", version: "9.9.9", gitSha: sha, gitShaSource: "npm lockfile" });
});
