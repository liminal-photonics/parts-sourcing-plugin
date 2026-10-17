// Live known-answer checks against the real Digi-Key, Mouser and Newark APIs (needs the API keys in the environment).
// Prints one PASS/FAIL line per expectation and exits 1 on any FAIL. Usage: node scripts/known-answer.mjs
import { getPartDetails, compareDistributors, searchParts, status } from "../src/core.js";

let fails = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`); if (!ok) fails++; };
const mfr = (r) => r?.manufacturer || "-";

const s = status();
check("status reports version and gitSha", Boolean(s.version) && /^[0-9a-f]{40}$|^unknown$/.test(s.gitSha), `${s.version} ${s.gitSha}`);

// 1. LM358DR: TI is the maker; Digi-Key also lists the UMW clone with the same MPN.
const a = await getPartDetails({ partNumber: "LM358DR" });
const dk = a.results.digikey;
check("LM358DR Digi-Key shows Texas Instruments when Mouser/Newark answer", /texas/i.test(mfr(dk)), `${mfr(dk)} ${dk?.distributorPartNumber} stock ${dk?.stock}`);
check("LM358DR Digi-Key manufacturerConfirmed", dk?.manufacturerConfirmed === true);
check("LM358DR Digi-Key stock refreshed", dk?.stockFresh === true);
check("LM358DR Mouser is TI", /texas/i.test(mfr(a.results.mouser)), `${mfr(a.results.mouser)} stock ${a.results.mouser?.stock}`);
check("LM358DR Newark is TI", /texas/i.test(mfr(a.results.newark)), `${mfr(a.results.newark)} stock ${a.results.newark?.stock}`);
console.log("      Digi-Key otherManufacturers:", JSON.stringify(dk?.otherManufacturers?.map((o) => o.manufacturer)));
const b = await getPartDetails({ partNumber: "LM358DR", distributors: ["digikey"] });
const multi = (b.results.digikey?.otherManufacturers || []).length > 0;
check("LM358DR Digi-Key-only: unconfirmed when several makers list it", !multi || b.results.digikey.manufacturerConfirmed === false, `${mfr(b.results.digikey)} multi=${multi}`);
check("LM358DR Digi-Key-only: note says NOT confirmed", !multi || /NOT confirmed/.test(b.notes.join(" ")));

// 2. BAS116LT1G: Digi-Key states Active; Mouser leaves lifecycle empty -> unknown, not a clean check.
const c = await compareDistributors({ partNumber: "BAS116LT1G", quantities: [25, 100] });
const row = (d) => c.rows.find((r) => r.distributor === d);
check("BAS116LT1G Digi-Key lifecycle active", row("Digi-Key")?.lifecycleStatus === "active", row("Digi-Key")?.lifecycle);
check("BAS116LT1G Mouser empty lifecycle = unknown", row("Mouser")?.lifecycleStatus === "unknown" && row("Mouser")?.cleanLifecycleCheck === false, `raw=${JSON.stringify(row("Mouser")?.lifecycle)}`);
check("BAS116LT1G Newark stocking status = unknown", !row("Newark") || row("Newark").lifecycleStatus === "unknown", row("Newark")?.lifecycle);
check("BAS116LT1G clean lifecycle checks = Digi-Key only (1 of 2 needed)", JSON.stringify(c.lifecycleSummary.cleanChecks) === '["Digi-Key"]', JSON.stringify(c.lifecycleSummary.cleanChecks));
console.log("      BAS116LT1G stock:", c.rows.map((r) => `${r.distributor} ${r.stock}`).join(", "), "| retrievedAt-able");

// 3. SN74LVC1G14DBVR: the keyword 20-result path used to show stale Digi-Key stock (5112 vs 47112).
const e = await getPartDetails({ partNumber: "SN74LVC1G14DBVR", distributors: ["digikey"] });
check("SN74LVC1G14DBVR Digi-Key is TI and stock is refreshed", /texas/i.test(mfr(e.results.digikey)) && e.results.digikey?.stockFresh === true, `${mfr(e.results.digikey)} stock ${e.results.digikey?.stock}`);

// 4. Keyword-search path marks Digi-Key stock as indicative.
const f = await searchParts({ keyword: "LM358DR", limit: 3, distributors: ["digikey"] });
check("search_parts Digi-Key rows are stockFresh:false", (f.results.digikey || []).length > 0 && f.results.digikey.every((r) => r.stockFresh === false), `${(f.results.digikey || []).length} rows`);

// 5. Nonexistent part: clean "no match" everywhere, no format error.
const g = await getPartDetails({ partNumber: "ZZZ-NOT-A-PART-123" });
check("ZZZ-NOT-A-PART-123 gives no-match notes, no errors", !/error/i.test(g.notes.join(" ")) && Object.values(g.results).every((r) => !r), g.notes.join(" | "));

// 6. ERJ-3EKF1002V: Newark stores it without the hyphen -> match note, exactMatch:false.
const h = await getPartDetails({ partNumber: "ERJ-3EKF1002V" });
check("ERJ-3EKF1002V Newark punctuation-blind match is flagged", !h.results.newark || h.results.newark.exactMatch === false || /ERJ-3EKF1002V/i.test(h.results.newark.manufacturerPartNumber), `${h.results.newark?.manufacturerPartNumber} exact=${h.results.newark?.exactMatch}`);
check("ERJ-3EKF1002V Mouser exact match", h.results.mouser?.exactMatch === true, h.results.mouser?.manufacturerPartNumber);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
