// End-to-end tests through the MCP tool path: spawn the real stdio server, point it at a local mock distributor
// server, call tools with the MCP client. Round 4 bugs: rate limits reported as bad keys, clone-maker picked on
// Digi-Key over the manufacturer other distributors list, Mouser "N/A" listings shown as orderable.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../src/index.js", import.meta.url));
let mock, base, mode = {};
const dkProduct = (mfr, pn, stock) => ({ Manufacturer: { Name: mfr }, ManufacturerProductNumber: "SN74LVC1G14DBVR", QuantityAvailable: stock, ProductStatus: { Status: "Active" }, ProductVariations: [{ DigiKeyProductNumber: pn, PackageType: { Name: "Cut Tape (CT)" }, QuantityAvailableforPackageType: stock, MinimumOrderQuantity: 1, StandardPricing: [{ BreakQuantity: 1, UnitPrice: 0.15 }] }] });

before(async () => {
  mock = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const send = (code, obj, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(obj)); };
      if (req.url.startsWith("/mouser")) {
        if (mode.mouser === "ratelimit") return send(403, { Errors: [{ Code: "TooManyRequests", Message: "Maximum calls per minute exceeded.", ResourceKey: "MaxCallPerMinute" }], SearchResults: null });
        const mpn = JSON.parse(body).SearchByPartRequest?.mouserPartNumber;
        if (mode.mouser === "na") return send(200, { Errors: [], SearchResults: { Parts: [{ MouserPartNumber: "N/A", ManufacturerPartNumber: mpn, Manufacturer: "Torex Semiconductor", LeadTime: "0 Days", PriceBreaks: [] }] } });
        if (mode.mouser === "availtext") return send(200, { Errors: [], SearchResults: { Parts: [{ MouserPartNumber: "595-" + mpn, ManufacturerPartNumber: mpn, Manufacturer: "Texas Instruments", Availability: mode.avail, PriceBreaks: [] }] } });
        return send(200, { Errors: [], SearchResults: { Parts: [{ MouserPartNumber: "595-" + mpn, ManufacturerPartNumber: mpn, Manufacturer: "Texas Instruments", AvailabilityInStock: "2791", LeadTime: "0 Days", PriceBreaks: [{ Quantity: 1, Price: "$0.20", Currency: "USD" }] }] } });
      }
      if (req.url.startsWith("/newark")) {
        mode.newarkHits = (mode.newarkHits || 0) + 1;
        if (mode.newark === "qps" || (mode.newark === "qps-once" && mode.newarkHits === 1)) return send(403, { error: { code: 403, message: "Account Over Queries Per Second Limit" } }, { "x-mashery-error-code": "ERR_403_DEVELOPER_OVER_QPS", "retry-after": "1" });
        if (mode.newark === "bare403") return send(403, {});
        if (mode.newark === "auth403") return send(403, { error: { code: 403, message: "Not Authorized" } }, { "x-mashery-error-code": "ERR_403_NOT_AUTHORIZED" });
        if (mode.newark === "rate") return send(403, { error: { code: 403, message: "Account Over Rate Limit" } }, { "x-mashery-error-code": "ERR_403_DEVELOPER_OVER_RATE" });
        return send(200, { manufacturerPartNumberSearchReturn: { numberOfResults: 0, products: [] } });
      }
      if (req.url.startsWith("/dk/v1/oauth2/token")) return send(200, { access_token: "t", expires_in: 600 });
      if (req.url.includes("/productdetails")) return send(404, {});
      if (req.url.includes("/search/keyword")) return send(200, { Products: [dkProduct("UMW", "4518-X-ND", 26200), dkProduct("Texas Instruments", "296-11607-1-ND", 5112)] });
      send(404, {});
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${mock.address().port}`;
});
after(() => mock.close());

async function callTool(name, args) {
  const env = { ...process.env, MOUSER_API_KEY: "k", NEWARK_API_KEY: "k", DIGIKEY_CLIENT_ID: "i", DIGIKEY_CLIENT_SECRET: "s", MOUSER_API_BASE: `${base}/mouser`, NEWARK_API_BASE: `${base}/newark`, DIGIKEY_API_BASE: `${base}/dk`, PARTS_WATCH_FILE: `${process.env.TMPDIR || "/tmp"}/pw-mcp-test-${process.pid}.json` };
  const c = new Client({ name: "test", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env }));
  try { const r = await c.callTool({ name, arguments: args }); return JSON.parse(r.content[0].text); } finally { await c.close(); }
}
const DETAILS = "get_part_details";

test("MCP: Mouser per-minute limit is reported as a rate limit, not a bad key", async () => {
  mode = { mouser: "ratelimit" };
  const r = await callTool(DETAILS, { partNumber: "BSS138", distributors: ["mouser"] });
  const n = r.notes.join(" ");
  assert.match(n, /rate limit/i);
  assert.doesNotMatch(n, /rejected the API key/i);
});

test("MCP: Newark per-second limit is retried; a used-up quota is a rate limit, not a bad key", async () => {
  mode = { newark: "qps-once" };
  let r = await callTool(DETAILS, { partNumber: "BSS138", distributors: ["newark"] });
  assert.doesNotMatch(r.notes.join(" "), /rejected|rate limit/i);
  assert.ok(mode.newarkHits >= 2);
  mode = { newark: "rate" };
  r = await callTool(DETAILS, { partNumber: "BSS138", distributors: ["newark"] });
  assert.match(r.notes.join(" "), /rate limit/i);
  assert.doesNotMatch(r.notes.join(" "), /rejected the API key/i);
});

test("MCP: Digi-Key listing switches to the manufacturer Mouser lists, not a clone with more stock", async () => {
  mode = {};
  const r = await callTool(DETAILS, { partNumber: "SN74LVC1G14DBVR", distributors: ["mouser", "digikey"] });
  assert.equal(r.results.digikey.manufacturer, "Texas Instruments");
  assert.equal(r.results.digikey.distributorPartNumber, "296-11607-1-ND");
  assert.equal(r.results.digikey.otherManufacturers[0].manufacturer, "UMW");
  assert.equal(r.results.mouser.leadTime, null); // "0 Days" means not stated
});

test("MCP: Mouser 'N/A' listing is not shown as an orderable part number", async () => {
  mode = { mouser: "na" };
  const r = await callTool(DETAILS, { partNumber: "XC6206P332MR", distributors: ["mouser"] });
  assert.equal(r.results.mouser.distributorPartNumber, null);
  assert.match(r.results.mouser.availabilityNote, /does not sell/);
});

test("MCP: Mouser stock is read only from recognized availability text, never by gluing digits together", async () => {
  for (const [avail, want] of [["In stock 500, 1000 on order", null], ["39,388 In Stock", 39388], ["2500 In Stock", 2500], ["On Order", null], ["None", 0]]) {
    mode = { mouser: "availtext", avail };
    const r = await callTool(DETAILS, { partNumber: "LM358DR", distributors: ["mouser"] });
    assert.equal(r.results.mouser.stock, want, avail);
  }
});

test("MCP: a Newark 403 with no rate-limit or auth signal is reported neutrally, not as a bad key", async () => {
  mode = { newark: "bare403" };
  let r = await callTool(DETAILS, { partNumber: "BSS138", distributors: ["newark"] });
  let n = r.notes.join(" ");
  assert.match(n, /Newark/);
  assert.doesNotMatch(n, /rejected the API key/i);
  assert.match(n, /try again/i);
  mode = { newark: "auth403" };
  r = await callTool(DETAILS, { partNumber: "BSS138", distributors: ["newark"] });
  assert.match(r.notes.join(" "), /rejected the API key/i);
});
