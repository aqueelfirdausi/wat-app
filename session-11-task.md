# Session 11 — Category Pills Scroll Indicator

## Goal

Add a soft gradient fade on the right edge of the category pills strip to visually hint that more pills exist off-screen. Pure CSS only — no JavaScript, no event listeners, no state changes.

---

## Context

The category bar is implemented in `components/homepage-client.tsx` and `app/globals.css`.

- The outer sticky element uses the class `.category-bar-sticky` on a `<section>` tag
- The inner scrollable row is a `<div className="category-strip">` (or similar — **inspect the file before touching anything**)
- The bar already has `backdrop-filter: blur(8px)` and a frosted background via CSS token(s)
- The sticky bar uses `position: sticky` on the `<section>` — do not touch this

---

## What To Build

### Step 1 — Inspect first

Read `components/homepage-client.tsx` and `app/globals.css` fully before making any changes.
Note the exact class names used on:
- The `<section>` (sticky wrapper)
- The inner scrollable div (pills row)
- The background color token(s) used on `.category-bar-sticky`

### Step 2 — Wrap the strip

In `homepage-client.tsx`, wrap the existing category strip `<div>` in a new `<div className="category-strip-wrapper">`.

Do not move, rename, or restructure any existing elements — only add the wrapper around the pills row.

### Step 3 — CSS

In `app/globals.css`, add styles for `.category-strip-wrapper` and its `::after` pseudo-element.

Requirements:
- `.category-strip-wrapper` must be `position: relative` with `overflow: hidden`
- `::after` pseudo-element: positioned absolute, right edge, top to bottom, width ~56px
- Gradient: from fully transparent (left) to the sticky bar's background color (right)
- The right-edge color must match the actual background token already used on `.category-bar-sticky`. Inspect the file — use the same `var(--token)` or `rgba()` value, do not guess or invent a new color
- `pointer-events: none` — the overlay must never block pill taps
- `z-index: 1` so it sits above the pills
- The pills strip itself must NOT get `overflow: hidden` — it must stay scrollable

### Step 4 — No other changes

Do not touch:
- The sticky behaviour (`position: sticky`, `top`, `z-index` on the section)
- The backdrop filter or frosted glass effect
- The pill styles, colors, or active state
- Any other component or file
- `package-lock.json` (unless a dependency was installed — which it should not be)

---

## Validation

Before committing, visually confirm:
1. Desktop — fade visible on right edge when more pills exist off-screen
2. Mobile (192.168.1.110:3000) — same fade, does not block pill tap targets
3. Scroll to end of pills — fade disappears naturally (it just clips, it does not need JS to hide)
4. Sticky behaviour unchanged — bar still sticks while scrolling page
5. Fresh today badge and product count still render correctly (regression check)

---

## Commit

Message: `Session 11 polish — category pills scroll indicator`

Do NOT push to GitHub. Local only. Push only after visual confirmation on mobile device and explicit instruction.

---

## Rules Reminder

- No Tailwind utility classes
- No JavaScript for this feature
- Inspect before editing
- `npm run lint` before committing
- Do not touch storefront design, Firebase config, or role boundaries
- Do not commit `session-11-task.md`, `tsconfig.tsbuildinfo`, or any firebase-adminsdk json file
- LF→CRLF warnings on Windows are known — nothing to act on
