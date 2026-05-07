# WAT App Local Mobile User Testing Checklist

## Test Purpose

Use this checklist to validate whether WAT App feels like a fast WhatsApp-first daily stock sheet.

The main question: can visitors quickly scan today's stock and move into WhatsApp with enough product context?

## Device / Testing Setup

- Test on an actual mobile device if possible.
- Also test in a narrow browser/mobile-width preview.
- Keep testing local only.
- Do not share or deploy live test links.
- Do not push, upload, or run Firebase deploy during testing.

## First Impression Test

- Does the first screen explain what WAT App is?
- Is "today's live stock" clear?
- Does the Urdu line feel natural?
- Are Today's Live Picks visible quickly?
- Does the page feel local, useful, and trustworthy?

## Category Browsing Test

- Are categories easy to tap?
- Does horizontal scrolling feel natural?
- Is the active category clear?
- Does selecting a category update products as expected?
- Does it still feel fast?

## Browse View Test

- Is the Catalog / Feed choice understandable?
- Does the Browse View card feel helpful or too tall?
- Does switching Catalog / Feed work?
- Does the preference persist as expected?

## Product Scanning Test

- Can the user scan two to three products quickly?
- Are image, title, price, stock badge, tags, and WhatsApp CTA readable?
- Is price visible early?
- Is the CTA easy to tap?
- Are cards compact but not cramped?

## WhatsApp Flow Test

- Does Ask on WhatsApp open the expected flow?
- Does product context feel clear before WhatsApp?
- Does the user understand this is not a full checkout ecommerce flow?

## Quick Return Test

- Does Save WAT App appear late enough?
- Does it feel helpful rather than interruptive?
- Does dismiss/save behavior still work?

## Feed Mode Test

- Does Feed feel optional, not forced?
- Is Feed useful for visual browsing?
- Are missing-image placeholders acceptable?
- Do real poster/spec images display acceptably?

## Pass / Fail Notes

| Area | Pass / Needs work | Notes | Priority |
| --- | --- | --- | --- |
| First impression |  |  |  |
| Category browsing |  |  |  |
| Browse View |  |  |  |
| Product scanning |  |  |  |
| WhatsApp flow |  |  |  |
| Quick Return |  |  |  |
| Feed mode |  |  |  |

## Decision

Possible outcomes after testing:

- Accept local mobile UX baseline.
- Keep current Catalog/mobile homepage baseline locked locally.
- Reopen Catalog/homepage polish only if the user explicitly requests it.
- Park Feed polish for a separate future local-only phase.
- Do Browse View micro-tightening only if explicitly reopened later.
- Do Quick Return simplification only if explicitly reopened later.
- Pause and keep testing.

## Feed Work Parked

Feed polish is not part of the current Catalog/mobile homepage baseline.

- Do not mix Feed polish with Catalog/homepage polish.
- Feed should be reviewed one item at a time later.
- Future Feed work should use a separate local-only phase named "Feed Mode Review & Polish".
- Do not start Feed polish inside this checklist/documentation phase.
