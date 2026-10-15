import { digikeyConfigured, digikeySearch, digikeyDetails } from "./digikey.js";
import { mouserConfigured, mouserSearch, mouserDetails } from "./mouser.js";
import { newarkConfigured, newarkSearch, newarkDetails } from "./newark.js";

const SOURCES = {
  digikey: { name: "Digi-Key", configured: digikeyConfigured, search: digikeySearch, details: digikeyDetails, env: "DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET" },
  mouser: { name: "Mouser", configured: mouserConfigured, search: mouserSearch, details: mouserDetails, env: "MOUSER_API_KEY" },
  newark: { name: "Newark", configured: newarkConfigured, search: newarkSearch, details: newarkDetails, env: "NEWARK_API_KEY" },
};

function pick(distributors) {
  const keys = distributors && distributors.length ? distributors.map((d) => d.toLowerCase().replace(/[^a-z]/g, "")) : Object.keys(SOURCES);
  return keys.filter((k) => SOURCES[k]);
}

async function fanOut(distributors, fn) {
  const results = {};
  const notes = [];
  await Promise.all(
    pick(distributors).map(async (k) => {
      const s = SOURCES[k];
      if (!s.configured()) {
        notes.push(`${s.name} skipped: set ${s.env} to enable it.`);
        return;
      }
      try {
        results[k] = await fn(s);
      } catch (e) {
        notes.push(`${s.name} error: ${e.message}`);
      }
    })
  );
  return { results, notes };
}

export async function searchParts({ keyword, limit = 5, distributors }) {
  const { results, notes } = await fanOut(distributors, (s) => s.search(keyword, limit));
  return { keyword, results, notes };
}

export async function getPartDetails({ partNumber, distributors }) {
  const { results, notes } = await fanOut(distributors, (s) => s.details(partNumber));
  for (const k of Object.keys(results)) if (!results[k]) notes.push(`${SOURCES[k].name}: no match for ${partNumber}.`);
  return { partNumber, results, notes };
}

export function priceAt(breaks, qty) {
  if (!breaks || !breaks.length) return null;
  const sorted = [...breaks].sort((a, b) => a.qty - b.qty);
  let best = null;
  for (const b of sorted) if (qty >= b.qty && b.unitPrice != null) best = b;
  return best ? { breakQty: best.qty, unitPrice: best.unitPrice, extended: +(best.unitPrice * qty).toFixed(4) } : { belowMinimum: true, minimumBreak: sorted[0].qty };
}

export async function compareDistributors({ partNumber, quantities = [1, 10, 100, 1000], distributors }) {
  const d = await getPartDetails({ partNumber, distributors });
  const rows = Object.values(d.results).filter(Boolean).map((r) => ({
    distributor: r.distributor,
    distributorPartNumber: r.distributorPartNumber,
    manufacturer: r.manufacturer,
    manufacturerPartNumber: r.manufacturerPartNumber,
    stock: r.stock,
    leadTime: r.leadTime,
    lifecycle: r.lifecycle,
    discontinued: r.discontinued,
    countryOfOrigin: r.countryOfOrigin,
    countryOfOriginNote: r.countryOfOriginNote,
    datasheetUrl: r.datasheetUrl,
    productUrl: r.productUrl,
    pricing: Object.fromEntries(quantities.map((q) => [q, priceAt(r.priceBreaks, q)])),
  }));
  const cheapest = {};
  for (const q of quantities) {
    let best = null;
    for (const r of rows) {
      const p = r.pricing[q];
      if (p && p.unitPrice != null && (r.stock ?? 0) >= q && (!best || p.unitPrice < best.unitPrice)) best = { distributor: r.distributor, unitPrice: p.unitPrice };
    }
    cheapest[q] = best || "No distributor has this quantity in stock at a listed price";
  }
  const flags = [];
  if (rows.length === 1) flags.push(`Only found at ${rows[0].distributor} (single source among checked distributors).`);
  for (const r of rows) {
    if (r.discontinued || /obsolete|not recommended|eol|end of life|last time/i.test(r.lifecycle || "")) flags.push(`${r.distributor}: lifecycle "${r.lifecycle}".`);
    if ((r.stock ?? 0) === 0) flags.push(`${r.distributor}: zero stock.`);
  }
  return { partNumber, quantities, rows, cheapestInStock: cheapest, flags, notes: d.notes };
}

export function status() {
  return Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, s.configured() ? "configured" : `missing ${s.env}`]));
}
