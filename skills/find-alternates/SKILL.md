---
name: find-alternates
description: Use when the user needs a second source, a replacement for an EOL or out-of-stock part, or drop-in alternates for a component, checked against Digi-Key and Mouser.
---

# Find alternates

Find candidate drop-in replacements and say exactly what still has to be verified.

## Steps

1. Look up the original with `get_part_details`. Pull its key parameters from the description and datasheet: function, package/footprint, value and tolerance, voltage/current/power ratings, temperature range, pinout, and any qualification (e.g. AEC-Q200).
2. Build 2–4 keyword searches from those parameters (e.g. "10k 1% 0603 thick film 0.1W") and call `search_parts` on both distributors.
3. Keep candidates that are Active, in stock, and match the package and core ratings. Drop anything that only matches loosely.
4. For the best 3–5, call `compare_distributors` to show price and stock side by side.

## Output

For each candidate: MPN, manufacturer, why it fits, price and stock, and a **Verify** list. Always include the items that cannot be confirmed from distributor data, such as:
- Footprint and pinout against the datasheet (not just the package name)
- Electrical limits at your operating point, not just the headline rating
- Firmware or register differences for ICs and modules; certification (FCC/IC/CE) for radio modules
- Temperature, derating, and any qualification your design needs

Never call a part a guaranteed drop-in. Call it a "candidate" until the user verifies the datasheet.
