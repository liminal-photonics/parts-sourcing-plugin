---
name: bom-costing
description: Use when the user wants to price a bill of materials (BOM) at one or more build quantities using Digi-Key, Mouser and Newark, or asks which BOM lines are risky (single source, end of life, low stock).
---

# BOM costing

Price a BOM at the build quantities the user gives, using the `parts-sourcing` MCP tools.

## Steps

1. Get the BOM: one row per line with manufacturer part number (MPN), quantity per board, and reference designators if available. Ask for build quantities if not given (default: 1, 10, 100 boards).
2. Call `sourcing_status` once. If a distributor is not configured, say so and continue with the other.
3. For each line, call `compare_distributors` with the MPN and `quantities` = qty per board × each build quantity. Do not substitute a different MPN without saying so.
4. Build a table per build quantity: line, MPN, qty needed, best in-stock distributor, unit price at the matching break, extended price, stock. Sum the total and the per-board cost.
5. Flag each line that is:
   - **Single source**: found at only one distributor checked.
   - **EOL / NRND / obsolete**: any lifecycle value other than Active, or discontinued/end-of-life true. Mouser often leaves lifecycle blank; report that as "not stated", not "Active".
   - **Low stock**: stock below 2× the quantity needed for the largest build.
   - **Not found**: no match at either distributor.
6. Note that prices are distributor list prices at query time, in the account's currency, before tax, shipping, tariffs and reel or MOQ effects. Note any line where the quantity is below the first price break.

## Output

A short summary (total per build quantity, number of flagged lines), then the table, then the flagged lines with the reason. Suggest the `find-alternates` skill for flagged lines.
