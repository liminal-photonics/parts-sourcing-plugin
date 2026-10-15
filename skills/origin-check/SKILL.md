---
name: origin-check
description: Use when the user asks where a component is made, its country of origin (COO), or whether parts support a "Made in" or "Assembled in" claim.
---

# Origin check

Report what the distributor data says about country of origin and nothing more.

## Steps

1. For each part, call `compare_distributors` (or `get_part_details`).
2. Read `countryOfOrigin` and `countryOfOriginNote` for each distributor. Digi-Key's Product Information API v4 does not return COO; Mouser returns it only when a compliance field carries it. HTS and ECCN codes, when present, are trade classifications, not origin.
3. Report per part: COO per distributor, or "not provided by the API".

## Rules

- Never infer origin from the manufacturer's headquarters, brand, or website. A US company can make parts anywhere.
- If sources disagree, report both and say they disagree.
- COO can change by lot. Tell the user that the packing slip, the reel label, or a manufacturer COO letter is the record that counts.
- Do not state or endorse a marketing claim ("Made in USA", "Assembled in USA") from this data. Say what the data shows, and that such claims follow legal rules (for example FTC rules in the US) that component COO alone does not settle.
