// element14 / Newark / Farnell Product Search API client (API key from partner.element14.com).
const BASE = process.env.NEWARK_API_BASE || "https://api.element14.com/catalog/products";

export function newarkConfigured() {
  return Boolean(process.env.NEWARK_API_KEY);
}

export function newarkStore() {
  return process.env.NEWARK_STORE || "www.newark.com";
}

async function e14(term, limit) {
  const q = new URLSearchParams({
    term,
    "storeInfo.id": newarkStore(),
    "resultsSettings.offset": "0",
    "resultsSettings.numberOfResults": String(Math.min(limit, 50)),
    "resultsSettings.responseGroup": "large",
    "callInfo.responseDataFormat": "json",
    "callInfo.apiKey": process.env.NEWARK_API_KEY,
  });
  const res = await fetch(`${BASE}?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Newark HTTP ${res.status}`);
  const j = await res.json();
  if (j.Fault) throw new Error(`Newark: ${j.Fault.faultstring || "API fault"}`);
  // The return wrapper name depends on the search type (keywordSearchReturn, manufacturerPartNumberSearchReturn, premierFarnellPartNumberReturn).
  const wrapper = Object.values(j).find((v) => v && typeof v === "object" && "numberOfResults" in v) || {};
  return wrapper.products || [];
}

const EOL_STATUS = /NO_LONGER|OBSOLETE|DISCONTINUED|END_OF_LIFE|NO_LONGER_MANUFACTURED/i;

export function normalizeNewark(p) {
  if (!p) return null;
  const status = p.productStatus || p.stock?.status || null;
  const stock = p.stock?.level ?? p.inv ?? null;
  const lead = p.stock?.leastLeadTime;
  const coo = p.countryOfOrigin || p.coo || null;
  const ds = (p.datasheets || []).find((d) => d.url) || null;
  return {
    distributor: "Newark",
    distributorPartNumber: p.sku || null,
    manufacturer: p.brandName || p.vendorName || null,
    manufacturerPartNumber: p.translatedManufacturerPartNumber || null,
    description: p.displayName || null,
    stock: typeof stock === "number" ? stock : stock != null ? parseInt(stock, 10) || 0 : null,
    leadTime: lead ? `${lead} days` : null,
    lifecycle: status ? String(status) : null,
    discontinued: EOL_STATUS.test(String(status || "")),
    endOfLife: EOL_STATUS.test(String(status || "")),
    countryOfOrigin: coo,
    countryOfOriginNote: coo ? "From element14 product data" : "Not provided in element14 search response",
    packaging: p.packSize ? `pack of ${p.packSize}` : null,
    minimumOrderQty: p.translatedMinimumOrderQuality ?? p.translatedMinimumOrderQuantity ?? null,
    priceBreaks: (p.prices || []).map((b) => ({ qty: b.from, unitPrice: typeof b.cost === "number" ? b.cost : parseFloat(b.cost) })),
    currency: "store currency",
    datasheetUrl: ds ? ds.url : null,
    productUrl: p.sku ? `https://${newarkStore()}/search?st=${encodeURIComponent(p.sku)}` : null,
    rohs: p.rohsStatusCode || null,
  };
}

export async function newarkSearch(keyword, limit = 10) {
  return (await e14(`any:${keyword}`, limit)).slice(0, limit).map(normalizeNewark);
}

export async function newarkDetails(partNumber) {
  let parts = await e14(`manuPartNum:${partNumber}`, 10);
  if (!parts.length) parts = await e14(`id:${partNumber}`, 1); // Newark/Farnell order code
  const pn = partNumber.toUpperCase();
  const exact = parts.find((p) => (p.translatedManufacturerPartNumber || "").toUpperCase() === pn || String(p.sku || "").toUpperCase() === pn);
  return normalizeNewark(exact || parts[0]);
}
