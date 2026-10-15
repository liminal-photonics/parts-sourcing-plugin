# Parts Sourcing (Digi-Key, Mouser, Newark)

A Grok Bot / Cursor plugin that searches, prices and compares electronic components across **Digi-Key**, **Mouser** and **Newark** (element14) side by side. It bundles a local MCP server and three skills.

<img src="assets/logo.svg" width="96" alt="logo">

## What you get

**MCP tools** (server `parts-sourcing`, local stdio, Node 18+):

| Tool | What it does |
| --- | --- |
| `search_parts` | Keyword search on all configured distributors, e.g. `10k resistor 0603 1%` |
| `get_part_details` | Look up one part by manufacturer or distributor part number |
| `compare_distributors` | Price at each quantity, stock, lead time, lifecycle, country of origin only when the distributor provides it, datasheet; flags single-source, EOL and zero stock |
| `sourcing_status` | Shows which API keys are configured |

**Skills**

- `bom-costing`: price a BOM at build quantities and flag single-source, EOL and low-stock lines
- `find-alternates`: find drop-in candidates and list what you still need to verify
- `origin-check`: report country of origin exactly as the data gives it, with no guessing

If a distributor's key is not set, that distributor is skipped with a note and everything else still works.

## Install

Install **Parts Sourcing** from the Grok Bot or Cursor plugin marketplace. To run it by hand in any MCP client:

```json
{
  "mcpServers": {
    "parts-sourcing": {
      "command": "npx",
      "args": ["-y", "github:liminal-photonics/parts-sourcing-plugin"],
      "env": {
        "DIGIKEY_CLIENT_ID": "...",
        "DIGIKEY_CLIENT_SECRET": "...",
        "MOUSER_API_KEY": "...",
        "NEWARK_API_KEY": "..."
      }
    }
  }
}
```

## API keys (bring your own)

You need your own keys. This repo stores none, and calls go straight from your machine to the distributor.

**Digi-Key** (Product Information API v4, OAuth2 client credentials)
1. Sign in at https://developer.digikey.com and create an Organization, then a Production app.
2. Add the **ProductInformation V4** API to the app.
3. Copy the Client ID and Client Secret into `DIGIKEY_CLIENT_ID` and `DIGIKEY_CLIENT_SECRET`.

**Mouser** (Search API)
1. Sign in at https://www.mouser.com/api-search/ and request a **Search API** key.
2. Put it in `MOUSER_API_KEY`.

**Newark / element14** (Product Search API)
1. Register at https://partner.element14.com (Register link, top right) and confirm your email.
2. Sign in, open **My Account → Applications → Register a new application**, pick the Product Search API, and accept the terms.
3. Copy the issued API key into `NEWARK_API_KEY`.
4. Optional: `NEWARK_STORE` picks the store (default `www.newark.com`; e.g. `uk.farnell.com`, `de.farnell.com`, `au.element14.com`). Prices come in that store's currency.

Set them as environment variables where your agent runs (the plugin's `mcp.json` reads `${env:...}`). Optional: `DIGIKEY_LOCALE_SITE` (default `US`) and `DIGIKEY_CURRENCY` (default `USD`).

## Examples

- "Find a 10k 0603 1% resistor in stock at Digi-Key, Mouser and Newark."
- "Compare RC0603FR-0710KL at 100 and 1000 pieces."
- "Price this BOM at 10, 100 and 500 boards and flag risky lines." (attach a CSV)
- "Find a second source for this nRF52840 module."
- "What country of origin do the distributors report for these parts?"

## Data notes

- Prices are list prices at query time, before tax, shipping and tariffs.
- Country of origin is reported only when the distributor provides it. Digi-Key's v4 API usually doesn't, and Mouser and Newark include it only for some parts. Otherwise the tools return `null` with a note.
- Mouser leaves lifecycle blank for most active parts. Blank means "not stated".
- Newark's status (STOCKED, DIRECT_SHIP, NO_LONGER_STOCKED, ...) is its own stocking status, not the manufacturer lifecycle. One MPN can have several Newark SKUs (cut tape, reel, legacy). The tools pick the in-stock SKU with the lowest minimum order, list the others in `otherSkus`, and show stock per warehouse (Newark stock can include UK warehouse stock).
- Each distributor rate-limits its API (for example Mouser allows about 30 calls a minute and 1,000 a day). A rate-limited distributor shows up as a note while the others still answer. Requests time out after 20 s (`PARTS_SOURCING_TIMEOUT_MS` changes this).
- Lead times come straight from each distributor: Digi-Key reports manufacturer lead weeks Mouser reports its own lead-time text, and Newark reports its shortest lead time in days.
- Digi-Key splits a product into packaging options (cut tape, tape & reel, Digi-Reel). Prices come from the in-stock option a buyer would order (cut tape first, then the lowest minimum order); stock is Digi-Key's product total, because the options share one pool. Each option's stock is listed under `stockByPackaging`. When a part number is shared by several manufacturers, Digi-Key's exact lookup fails, so the tool falls back to keyword search, keeps exact part-number matches only and lists the other manufacturers.

## Development

```bash
npm install
npm test                 # offline unit tests
MOUSER_API_KEY=... NEWARK_API_KEY=... DIGIKEY_CLIENT_ID=... DIGIKEY_CLIENT_SECRET=... npm run live   # live smoke test over stdio
```

## License

MIT © Liminal Photonics
