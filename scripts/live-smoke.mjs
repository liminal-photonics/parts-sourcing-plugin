// Live smoke test over stdio: spawns the server and calls the tools with real keys from env.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const t = new StdioClientTransport({ command: "node", args: ["src/index.js"], env: process.env });
const c = new Client({ name: "smoke", version: "0" });
await c.connect(t);
console.log("tools:", (await c.listTools()).tools.map((x) => x.name).join(", "));
const call = async (name, args) => JSON.parse((await c.callTool({ name, arguments: args })).content[0].text);
console.log("status:", await call("sourcing_status", {}));
for (const kw of process.argv.slice(2).length ? process.argv.slice(2) : ["10k resistor 0603 1%", "nRF52840 module"]) {
  const r = await call("search_parts", { keyword: kw, limit: 3 });
  console.log(`\n== search "${kw}"`, r.notes);
  for (const [d, list] of Object.entries(r.results)) for (const p of list) console.log(` ${d}: ${p.manufacturer} ${p.manufacturerPartNumber} | ${p.distributorPartNumber} | stock ${p.stock} | ${p.lifecycle} | 1pc ${p.priceBreaks[0]?.unitPrice ?? "-"} | COO ${p.countryOfOrigin ?? "n/a"}`);
}
for (const pn of ["RC0603FR-0710KL", "MDBT50Q-1MV2"]) {
  const r = await call("compare_distributors", { partNumber: pn, quantities: [1, 100, 1000] });
  console.log(`\n== compare ${pn}`);
  console.log(JSON.stringify({ cheapestInStock: r.cheapestInStock, flags: r.flags, notes: r.notes, rows: r.rows.map(({ pricing, ...x }) => ({ ...x, pricing })) }, null, 1));
}
await c.close();
