#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { searchParts, getPartDetails, compareDistributors, status } from "./core.js";

const distributorsProp = {
  type: "array",
  items: { type: "string", enum: ["digikey", "mouser", "newark"] },
  description: "Limit to these distributors. Default: all configured.",
};

const TOOLS = [
  {
    name: "search_parts",
    description: "Search Digi-Key, Mouser and Newark by keyword (e.g. '10k 0603 resistor 1%'). Returns normalized results per distributor: MPN, manufacturer, stock, price breaks, lifecycle, lead time, datasheet.",
    inputSchema: { type: "object", properties: { keyword: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 50, default: 5 }, distributors: distributorsProp }, required: ["keyword"] },
  },
  {
    name: "get_part_details",
    description: "Look up one part by manufacturer part number or distributor part number on Digi-Key, Mouser and Newark.",
    inputSchema: { type: "object", properties: { partNumber: { type: "string", minLength: 1 }, distributors: distributorsProp }, required: ["partNumber"] },
  },
  {
    name: "compare_distributors",
    description: "Compare one part across Digi-Key, Mouser and Newark: unit price at each quantity, stock, lead time, lifecycle, country of origin (only when the API returns it), datasheet. Flags single-source, EOL and zero stock.",
    inputSchema: { type: "object", properties: { partNumber: { type: "string", minLength: 1 }, quantities: { type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: 20, default: [1, 10, 100, 1000] }, distributors: distributorsProp }, required: ["partNumber"] },
  },
  {
    name: "sourcing_status",
    description: "Show which distributor API keys are configured.",
    inputSchema: { type: "object", properties: {} },
  },
];

const server = new Server({ name: "parts-sourcing", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    let out;
    if (name === "search_parts") out = await searchParts(a);
    else if (name === "get_part_details") out = await getPartDetails(a);
    else if (name === "compare_distributors") out = await compareDistributors(a);
    else if (name === "sourcing_status") out = status();
    else throw new Error(`Unknown tool ${name}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});
await server.connect(new StdioServerTransport());
