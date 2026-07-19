# MVPLUXCREATIONS Launch Fixes Report

Date: July 18, 2026

Scope: Only the confirmed launch-critical findings from `docs/Project_Health_Audit.md`: frontend/database contracts, checkout price authority, Admin save/publish concurrency, private Admin data exposure, publishing image validation, draft inventory synchronization, and the confirmed Admin offer-action permission failure.

No deployment, Git commit, Git push, image edit, image move, image rename, or image deletion was performed.

## Summary

This batch removes the insecure direct-order fallback, makes the secure checkout RPC validate item prices from published server-side price settings, prevents stale Admin clients and the publishing function from overwriting newer Admin state, restricts unpublished `site_edits` data to authenticated Admins, verifies all snapshot images before a GitHub publication, synchronizes the draft inventory, and routes offer decisions and test-offer deletion through secured RPCs.

The code is locally deploy-ready, but the coordinated Supabase migration and Edge Function deployment remain required before these website changes can be released. The database migration must be deployed first because the updated Admin code depends on the new `save_site_edits` RPC and `site_edits.revision` column.

## Files changed

| File | Change | Why it was necessary |
| --- | --- | --- |
| `admin.html` | Adds one global `Delete All Test Offers` control to the existing Offers section. | Provides an explicit Admin action without exposing deletion on real offer cards. |
| `admin.js` | Loads `site_edits.revision`; saves top-level patches through `save_site_edits`; includes normalized price settings in published snapshots and change summaries; routes Accept, Decline, Counteroffer, and test-offer deletion through secured RPCs. | Prevents stale whole-document Admin saves, ensures customer-visible pricing has a published source, fixes direct offer-update permission failures, and prevents browser-side deletion of real offers. |
| `script.js` | Removes direct `order_requests` insertion fallback; sends selected height and supported finish metadata to the secure checkout RPC; reads public pricing from the published snapshot; queues revision-aware Admin/inline saves. | Prevents checkout from bypassing server validation, keeps public pricing aligned with publication, and prevents same-session save collisions. |
| `product-drafts.json` | Regenerated from the repository inventory. | Adds all 12 new unassigned images and removes two images already published as products. |
| `supabase-schema.sql` | Adds `site_edits.revision`, private Admin SELECT policy, `save_site_edits`, authoritative height-price validation, a role-aware `respond_to_member_offer`, and Admin-only test-offer deletion RPCs while revoking direct offer UPDATE/DELETE. | Aligns the reference schema with the frontend and closes confirmed data-exposure, overwrite, checkout-price, offer-permission, and real-record deletion risks. |
| `supabase-live-admin-fix.sql` | Aligns the focused Admin SQL with private reads and revision-aware saving. | Prevents this older operational script from reinstalling the insecure public policy or an incompatible Admin table. |
| `supabase/migrations/20260718120000_catch_up_offer_account_order_schema.sql` | Adds the revision column, Admin-only policies, `save_site_edits`, grants, preflight type checks, server-authoritative order price validation, role-aware offer transitions, and Admin-only test-offer deletion RPCs. | Provides the additive, rerunnable deployment path required by the current frontend without granting direct offer mutation privileges. |
| `supabase/functions/publish-admin-changes/index.ts` | Uses revision-aware patch saves with conflict retries; updates only publication fields; validates price settings; confirms every snapshot image exists in GitHub or is included in the same publish. | Prevents stale publication-history writes from erasing Admin changes and prevents publishing broken image references. |
| `SUPABASE_DEPLOYMENT.md` | Documents the new revision/RPC/security/checkout contracts and verification query. | Keeps the manual database deployment instructions consistent with the code that will depend on them. |
| `docs/Launch_Fixes_Report.md` | This report. | Records the exact changes, validation, and remaining blockers. |

## 1. Deploy readiness and database contracts

All current frontend `supabase.rpc()` calls now have matching definitions in the catch-up migration:

- `admin_update_order_status`
- `confirm_offer_payment`
- `get_admin_test_mode`
- `list_eligible_discounts`
- `prepare_offer_payment`
- `record_test_order_event`
- `respond_to_member_offer`
- `save_site_edits`
- `set_admin_test_mode`
- `submit_offer_payment`
- `submit_order_request`
- `submit_test_offer`
- `update_test_order_status`
- `validate_discount_code`

The website, reference schema, catch-up migration, focused Admin SQL, and publishing Edge Function use the same `save_site_edits(text,jsonb,bigint,boolean)` contract.

The migration remains additive and non-destructive:

- `site_edits.revision` is added with `ADD COLUMN IF NOT EXISTS` and a default of zero.
- Existing Admin JSON is preserved.
- No tables or columns are dropped.
- No customer, product, offer, order, history, discount, or image data is deleted.
- Known policies are replaced without altering table rows.
- The migration remains enclosed by one `begin`/`commit` transaction.

## 2. Checkout security

### Removed insecure fallback

`submitCheckoutRequest` no longer falls back to a direct browser insert into `order_requests` when `submit_order_request` is missing. A missing or failed secure RPC now produces the existing visible checkout error and does not create an unvalidated order.

The catch-up migration also removes the legacy direct-insert policy and revokes direct `order_requests` INSERT privileges from `anon` and `authenticated`.

### Server-authoritative pricing

Normal checkout items now include:

- submitted display name and image for order history;
- product slug where available;
- selected height in inches;
- current finish surcharge, which is currently zero for all supported finish choices;
- displayed item price.

`submit_order_request` does not accept the submitted item price as authority. It:

1. Reads the last successfully published price settings from `site_edits.edits.lastPublishedSnapshot.priceSettings`.
2. Falls back to the established published defaults when an older snapshot has no price settings.
3. Requires each height to be between 24 and 120 inches.
4. Calculates the height price using the same tier formula as `pricing.js`.
5. Rejects unsupported nonzero finish surcharges.
6. Rejects any item whose submitted price differs from the calculated server price.
7. Builds the authoritative subtotal from calculated prices.
8. Revalidates any discount and calculates the final amount server-side.

The existing manual Zelle, PayPal, Venmo, and Cash App workflow is unchanged. This work does not claim automatic payment authorization or capture.

### Published price settings

Future Admin snapshots include normalized `priceSettings`. Logged-out customers read those settings only from `published-admin-settings.json`; unpublished Admin pricing is no longer exposed as public website state.

## 3. Admin save and publishing reliability

### Optimistic concurrency

Every `site_edits` row now has a monotonically increasing `revision`.

The `save_site_edits` RPC:

- requires an authenticated row in `admin_profiles`;
- locks the selected page row;
- compares the caller's expected revision with the current revision;
- merges a top-level Admin patch or replaces one page's inline-edit document;
- increments the revision only on success;
- raises SQLSTATE `40001` on a stale save instead of overwriting newer data.

Both the Admin dashboard and inline storefront editor queue their own saves. Same-session operations therefore execute in order, while a stale second tab/session is rejected instead of erasing a newer revision.

### Publishing state writes

The Edge Function no longer reads an old full `admin-global` document and writes that document back after a GitHub commit. It now:

- rereads the latest revision before saving publication state;
- patches only `lastPublishedSnapshot` and `publishHistory`;
- retries revision conflicts up to three times;
- preserves unrelated product, draft, card, price, and image state;
- deduplicates a history entry by commit hash.

GitHub and Supabase remain separate systems, so they cannot form one database transaction. If GitHub succeeds while three consecutive Supabase history patches conflict, the function returns a specific reconciliation error without overwriting Admin data.

## 4. Secured offer decisions and test-data deletion

### Root cause

The Admin Accept, Decline, and Counteroffer buttons used a direct browser `offers.update(...)`. The live database correctly denied that table mutation, producing `permission denied for table offers`. The existing `respond_to_member_offer` RPC was member-only, so it could not safely replace the Admin path until its authorization and transition rules were extended.

### Offer transition contract

`respond_to_member_offer(uuid,text,numeric,text)` now determines the caller from `auth.uid()` and checks `admin_profiles` server-side:

- an Admin may accept or decline `pending` and `buyer_countered` offers;
- an Admin may counter a `pending` signed-in-member offer;
- a member may accept, decline, or submit one buyer counteroffer only on their own `countered` offer;
- acceptance becomes `accepted_awaiting_payment`;
- declines become `declined`;
- Admin counters become `countered` and buyer counters become `buyer_countered`;
- existing amounts, messages, timestamps, history triggers, and payment workflow remain in place.

The Admin UI waits for RPC success, immediately reloads the offer queues, and only then reports success. SQL errors are displayed verbatim enough to diagnose the database failure; a failed RPC does not move a card or show a false success.

### Test offers

Only cards whose stored `is_test` value is true render `Delete Test Offer`. The button calls `delete_test_offer(uuid)`, which rechecks both Admin authorization and `is_test` in the database.

The Offers section also has `Delete All Test Offers`. It requires the exact confirmation phrase `DELETE ALL TEST OFFERS` and calls `delete_all_test_offers()`. Both deletion RPCs:

- preserve real offers and customer accounts;
- refuse to proceed if a test offer is linked to an order not separately marked as test data;
- delete linked orders only when their own `is_test` value is true;
- return the exact numbers of deleted test offers and test orders;
- leave direct browser UPDATE and DELETE privileges on `offers` revoked.

## 5. Image inventory

The scanner reported:

- Total supported repository images: **178**
- Associated product images: **89**
- Excluded website assets: **26**
- Unpublished drafts before synchronization: **53**
- Unpublished drafts after synchronization: **63**

### Added draft paths

1. `images/MusicArtistStandees/MichaelJackson/MJbeatit/MJ1white1.png`
2. `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJMOONWALKblackbackground.png`
3. `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJMOONWALKbluebackground.png`
4. `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJMOONWALKlightbluebackground.png`
5. `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJSmoothCriminal.png`
6. `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJSmoothCriminalnobackground.png`
7. `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunk.png`
8. `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunkblackbackground.png`
9. `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunknobackground.png`
10. `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunknormal.png`
11. `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunkyellowbackground.png`
12. `images/SportLegendStandees/Kobe/KobeyLayout/KBlayup.png`

### Removed stale draft paths

- `images/FaithCelebrationStandees/Jesus/J5L.png`
- `images/FaithCelebrationStandees/Jesus/J5printD.png`

Those files remain intact and remain referenced by their published products. Only their obsolete draft records were removed.

Running the scanner a second time produced the identical `product-drafts.json` SHA-256, confirming idempotent inventory output.

## 6. Security fixes

The confirmed unpublished-data exposure is closed in all current SQL paths:

- the `Anyone can view site edits` policy is removed;
- anonymous SELECT on `site_edits` is revoked;
- authenticated SELECT is permitted only through the `Admins can view site edits` RLS policy;
- Admin inserts, updates, and deletes continue to require `admin_profiles` membership;
- public customer pages continue to use `published-admin-settings.json` and the fallback catalog.

No theoretical header, CDN, CSP, broad escaping, or unrelated authentication changes were included.

For offers specifically, no broad direct UPDATE or DELETE grant or RLS policy was added. All decision and deletion mutations are `SECURITY DEFINER` RPCs with a fixed `public, pg_temp` search path, explicit authentication, Admin checks through `admin_profiles`, ownership checks for member actions, row locks, and status-transition validation.

## 7. Publishing image integrity

Before creating a Git tree, the Edge Function now reads the complete target branch tree and collects every cutout, background, image-choice, and image-choice stage path in the snapshot.

A publication stops if any referenced image is neither:

- already present in the GitHub branch; nor
- explicitly included in the same Admin publication.

This prevents a valid-looking settings commit from deploying product cards with missing images.

## Validation results

| Check | Result | Evidence/limit |
| --- | --- | --- |
| `deno check` for changed/current browser JavaScript | PASS | `admin.js`, `script.js`, `member-account.js`, `password-reset.js`, `pricing.js`, `product-catalog.js`, and `supabase-config.js` passed. |
| Edge Function TypeScript check | PASS | `supabase/functions/publish-admin-changes/index.ts` passed `deno check`. |
| Python scanner syntax | PASS | Compiled with pycache outside the repository. |
| JSON parsing | PASS | `product-drafts.json` and `published-admin-settings.json` parse successfully. |
| Whitespace/conflict markers | PASS | `git diff --check` passed. |
| Frontend RPC definitions | PASS | All 16 RPC names called by current frontend files exist in the catch-up migration. |
| Admin offer handler execution | PASS (focused handler test) | The actual `updateAdminOffer` implementation called `respond_to_member_offer` exactly once, refreshed once after success, and exposed the database error without refresh or false success after failure. |
| Offer transition matrix | PASS (static SQL contract) | Admin pending accept/decline/counter, Admin buyer-counter accept/decline, and member own-offer counter accept/decline/counter paths are explicitly validated. Live SQL execution awaits migration deployment. |
| Test-offer deletion handlers | PASS (focused handler/static SQL test) | Single and bulk controls call their dedicated RPCs, require confirmation, refresh after success, and report returned counts. SQL requires Admin status and `is_test`; real offers cannot match either DELETE. |
| Direct offer mutation privileges | PASS | Admin JavaScript contains no direct offer UPDATE/DELETE, SQL revokes both privileges from browser roles, and no Admin offer UPDATE/DELETE policy is created. |
| Secure checkout path only | PASS | No direct `order_requests` insert remains in `script.js`. |
| Pricing parity samples | PASS | 24in=$35.00, 36in=$50.00, 78in=$129.99, 85in=$143.99, and 96in=$165.99 matched the current browser formula. |
| Admin revision contract | PASS | Dashboard, inline editor, migration, schema, and Edge Function use the same RPC arguments. |
| Public Admin-data policy | PASS | No current SQL creates a public `site_edits` SELECT policy or grants anonymous SELECT. |
| Draft synchronization | PASS | 63 drafts; all 12 added paths present; both stale paths absent; second scan unchanged. |
| Referenced image existence | PASS | 152 unique repository image references checked; zero missing. |
| Image content preservation | PASS | SHA-256 inventory before and after the work is identical. |
| Local storefront HTTP | PASS | `index.html` returned HTTP 200. |
| Local Admin HTTP | PASS | `admin.html` and `admin.js` returned HTTP 200. |
| Local login files | PASS (structural) | `signin.html`, `script.js`, and `supabase-config.js` returned HTTP 200; form, submit listener, `preventDefault`, and `signInWithPassword` remain connected. No credentialed login was performed. |
| Local checkout | PASS (structural) | Checkout handler, secure RPC call, item metadata, pricing calculations, and error path were checked. No production order was submitted. |
| Publishing | PASS (static only) | Publish controls/handler remain connected, Edge Function compiles, RPC contract matches, and image validation is present. A real publish was not invoked because it would create a GitHub commit and deployment. |
| Served-file freshness | PASS | Local server copies of `index.html`, `admin.html`, `signin.html`, `script.js`, and `admin.js` exactly matched workspace SHA-256 hashes. |

The in-app browser automation interface was not available in this session. Therefore authenticated login, authenticated Admin save/reload, real checkout submission, and visual modal interaction are not claimed as browser-tested.

## Required deployment order

1. Back up the live Supabase project.
2. Review and deploy the complete catch-up migration from `supabase/migrations/20260718120000_catch_up_offer_account_order_schema.sql` through the Supabase SQL Editor. This must precede the website because the Admin now calls `respond_to_member_offer`, `delete_test_offer`, and `delete_all_test_offers`.
3. Run the verification queries in `SUPABASE_DEPLOYMENT.md`, including the offer RPC signatures, revoked direct offer privileges, `save_site_edits` signature, and private `site_edits` policies.
4. Deploy the updated `publish-admin-changes` Edge Function.
5. Deploy the website files.
6. Sign in as Admin and verify one harmless save, refresh, and conflict test in two tabs.
7. Use Publish One GitHub Commit once so the public snapshot and server-side last-published price settings are aligned.
8. Test one normal manual-payment order request and verify the server rejects a deliberately altered price in a non-production/test context.
9. With controlled test records, execute every Admin/member offer transition, delete one test offer, bulk-delete remaining test offers, and verify that a real offer cannot be deleted.

Deploying the website before the database migration would make Admin saves fail because the live database would not yet have `site_edits.revision` or `save_site_edits`.

## Remaining launch blockers

### Must be completed before release

1. **Deploy and runtime-test the catch-up migration.** Static review cannot prove compatibility with the live database's actual objects, constraints, policies, or data.
2. **Runtime-test the secured offer workflow after migration.** Verify each transition and both test-deletion RPCs against controlled test records; do not use real offers for deletion testing.
3. **Redeploy the publishing Edge Function.** The conflict-safe history patch and image-existence guard do not exist live until redeployment.
4. **Perform authenticated browser tests.** Verify customer login persistence, Admin login, Admin save/reload, a deliberate two-tab revision conflict, and the public/private settings boundary.
5. **Perform one controlled checkout integration test.** Confirm the live RPC accepts an unaltered amount, rejects an altered browser amount, creates exactly one order request, and preserves the manual-payment workflow.
6. **Perform one controlled Admin publication.** Confirm one GitHub commit is created, `published-admin-settings.json` contains `priceSettings`, Supabase stores the same `lastPublishedSnapshot`, and public pages load it.

### Existing commerce limitations not changed in this batch

- Guest accepted-offer follow-up still lacks a verified email delivery path.
- There is no automatic card authorization/capture, payment webhook, refund, or reconciliation system; payments remain manual.
- Product names and images are stored for order history, while the server's launch-critical authority is the permitted height and calculated amount. A future nonzero finish surcharge must be added to a server-owned pricing table/allow-list before being enabled in the UI.
- GitHub commit creation and Supabase publish-history recording cannot be one atomic transaction; the new revision-safe retry/reconciliation error prevents data overwrite but cannot remove that external-system boundary.

## Scope confirmation

- No optional cleanup or refactoring was performed.
- No HTML or CSS redesign was performed.
- Authentication behavior was not changed.
- Manual payment destinations and workflow were preserved.
- No images or image folders were modified, renamed, moved, resized, compressed, replaced, or deleted.
- `supabase/.temp/` was not touched.
- Nothing was deployed, committed, or pushed.
