import { test } from "node:test";
import assert from "node:assert/strict";
import { priceAt, searchParts, status } from "../src/core.js";
import { normalizeMouser } from "../src/mouser.js";
import { normalizeDigikey } from "../src/digikey.js";

test("priceAt picks the highest break not above qty", () => {
  const b = [{ qty: 1, unitPrice: 0.1 }, { qty: 100, unitPrice: 0.01 }, { qty: 1000, unitPrice: 0.005 }];
  assert.equal(priceAt(b, 99).unitPrice, 0.1);
  assert.equal(priceAt(b, 100).unitPrice, 0.01);
  assert.equal(priceAt(b, 5000).extended, 25);
  assert.deepEqual(priceAt([{ qty: 10, unitPrice: 1 }], 5), { belowMinimum: true, minimumBreak: 10 });
});

test("mouser normalize parses prices and only reports origin when present", () => {
  const n = normalizeMouser({ MouserPartNumber: "x", PriceBreaks: [{ Quantity: 1, Price: "$1,234.50", Currency: "USD" }], AvailabilityInStock: "12", ProductCompliance: [{ ComplianceName: "USHTS", ComplianceValue: "8533" }] });
  assert.equal(n.priceBreaks[0].unitPrice, 1234.5);
  assert.equal(n.stock, 12);
  assert.equal(n.countryOfOrigin, null);
});

test("digikey normalize falls back to variation stock and never invents origin", () => {
  const n = normalizeDigikey({ ManufacturerProductNumber: "A", ProductVariations: [{ DigiKeyProductNumber: "A-CT-ND", PackageType: { Name: "Cut Tape (CT)" }, QuantityAvailableforPackageType: 7, StandardPricing: [{ BreakQuantity: 1, UnitPrice: 2 }] }] });
  assert.equal(n.stock, 7);
  assert.equal(n.countryOfOrigin, null);
});

test("missing keys are skipped gracefully", async () => {
  const saved = { ...process.env };
  delete process.env.MOUSER_API_KEY; delete process.env.DIGIKEY_CLIENT_ID; delete process.env.DIGIKEY_CLIENT_SECRET;
  const r = await searchParts({ keyword: "x" });
  assert.deepEqual(r.results, {});
  assert.equal(r.notes.length, 2);
  assert.match(status().mouser, /missing/);
  Object.assign(process.env, saved);
});
