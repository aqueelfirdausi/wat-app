# Day 5 — "Last updated" timestamp on the storefront

## Goal

Show a small, calm line near the product grid indicating when stock was last updated.
Gives customers confidence that the stock list is fresh without adding noise to the design.

---

## What to build

A single line of muted text that reads:

- `"Updated today at 3:45 PM"` — if the most recent product update was today
- `"Updated yesterday at 11:20 AM"` — if yesterday
- `"Updated 3 days ago"` — if older than yesterday (no time shown, just relative day count)

---

## Where it goes

**Below the section heading, above the product grid — catalog view only.**

The storefront has a section heading (e.g. "Featured" or "Latest arrivals") before the product grid.
Place the timestamp line directly below that heading, above the grid.

Read the file first and find the exact location before touching anything.

---

## Data source

- Read from existing `products` Firestore collection — no new collections, no new writes.
- Field to use: `updatedAt` (already stored on each product document).
- Logic: find the **most recent** `updatedAt` across all currently visible products
  (`storefrontVisible === true`).
- If no products are visible, show nothing (hide the line entirely).

---

## Implementation rules

### State
- Add one new state variable: `lastUpdatedAt: Date | null` — initialized to `null`.
- Set it inside the existing products fetch logic, after `setProducts` is called.
- Derive the display string from `lastUpdatedAt` using a pure helper function.

### Helper function
Write a pure function `formatLastUpdated(date: Date): string` in the same file.

Logic:
```
const now = new Date()
const diffMs = now.getTime() - date.getTime()
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

if (diffDays === 0) return `Updated today at ${formatTime(date)}`
if (diffDays === 1) return `Updated yesterday at ${formatTime(date)}`
return `Updated ${diffDays} days ago`
```

`formatTime` should return 12-hour format with AM/PM — e.g. `3:45 PM`.
Use `date.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true })`.

### Rendering
- Only render the timestamp line when `lastUpdatedAt !== null` AND `hasLoadedProducts === true`.
- Do NOT render during skeleton phase.
- Do NOT render when product list is empty.

### Placement
- Catalog view only — same guard as the skeleton (`storefrontMode === "catalog"`).
- Feed view: do not touch.

---

## CSS

Append to `globals.css` — do not inline styles.

```css
.last-updated-line {
  font-size: 12px;
  color: /* use the existing muted text color token already in globals.css */;
  margin-bottom: 12px;
  letter-spacing: 0.01em;
}
```

- No bold, no icon, no dot — plain muted text only.
- Match the muted color already used elsewhere in the file (check existing muted/secondary text color).
- Small and calm — should feel like metadata, not a feature.

---

## Files to change

| File | Change |
|---|---|
| `components/homepage-client.tsx` | Add `lastUpdatedAt` state; set it in fetch logic; add `formatLastUpdated` helper; render timestamp line in catalog section |
| `app/globals.css` | Append `.last-updated-line` block |

---

## What NOT to do

- Do not add a new Firestore query — reuse the products already fetched.
- Do not show the timestamp in Feed view.
- Do not show the timestamp during skeleton phase.
- Do not show the timestamp when no products are visible.
- Do not use Tailwind utility classes.
- Do not add an icon or decorative element.
- Do not hardcode a color hex — use an existing color token from `globals.css`.
- Do not touch any other part of the storefront.

---

## Commit message (when done)

```
Day 5 polish — last updated timestamp on storefront
```

---

## Checklist before committing

- [ ] `npm run lint` — passes clean
- [ ] `npm run typecheck` — passes clean
- [ ] Timestamp shows correctly when products are live
- [ ] Timestamp hidden during skeleton phase
- [ ] Timestamp hidden when no products visible (empty state)
- [ ] Feed view unaffected
- [ ] Scroll-to-top (Day 3) unaffected
- [ ] Skeleton (Day 4) unaffected
