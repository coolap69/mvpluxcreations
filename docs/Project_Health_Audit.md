# MVPLUXCREATIONS Project Health Audit

Audit date: July 18, 2026

Scope: Entire local repository, including HTML, CSS, JavaScript, JSON, Python, SQL, Supabase migration and Edge Function code, Git configuration files, operational Markdown/PDF documentation, published product data, draft inventory, and all image paths by reference and binary hash. This was a static, read-only technical audit. It did not deploy or query the live Supabase database, exercise authenticated production workflows, or alter images.

# Executive Summary

## What kind of website is this?

MVPLUXCREATIONS is a production static e-commerce website for life-size and smaller custom standees. It supports product/category browsing, image and display choices, height-based pricing, search, filtering, cart, manual-payment checkout requests, offers, member accounts, fan voting, and a substantial Admin system.

The frontend is plain HTML, CSS, and browser JavaScript hosted as static files. Supabase supplies authentication, Postgres data, Row Level Security, RPC functions, and one Edge Function. Product publication uses a default JavaScript catalog plus a deployable `published-admin-settings.json` snapshot. The publishing Edge Function securely creates a GitHub commit without exposing GitHub credentials in the browser.

## What is working well?

- The core storefront, category routing, product configuration, price calculation, cart, and manual-payment presentation are substantially implemented.
- The fallback catalog and published-snapshot merge provide useful resilience if the published JSON fails to load.
- The current published snapshot is internally consistent: 39 products, 11 category display cards, no duplicate slugs, and no missing referenced image files.
- Admin product, draft, image-choice, category, visibility, ordering, inline positioning, and publishing workflows are broad and data-driven.
- GitHub publishing keeps privileged credentials in a Supabase Edge Function and validates Admin membership.
- The repository has a thoughtful database design for offer history, payment confirmation, idempotent order creation, discounts, RLS, and Test Mode.
- All JavaScript/TypeScript syntax checks, Python compilation, JSON parsing, and `git diff --check` passed during this audit.
- No private key, service-role key, GitHub token, access token, or password was found in repository files. The browser Supabase publishable key is intentionally public.
- All 142 unique image paths referenced by repository text resolve to existing files.

## What is unfinished?

- The offer/account/order/discount/Test Mode database catch-up migration exists locally but is not proven deployed. The frontend currently expects RPCs and columns that may be absent from the live project.
- Secure server-side pricing is incomplete: a caller can submit its own item prices, and the secure order RPC only verifies those client-provided values against each other.
- Guest offer acceptance has no complete return path: there is no verified customer email notification and guests have no account history from which to continue payment.
- Direct non-offer payment submission is presented to the customer but is not persisted as a payment-submitted state in the normal real-order path.
- There is no automatic payment processor, authorization/capture workflow, webhook verification, refund workflow, or settlement reconciliation.
- The latest image inventory has not been synchronized: 12 new product images are absent from drafts, while two already-published Jesus images remain in the draft JSON.
- There is no automated test suite, continuous integration workflow, error monitoring, or production health monitoring.
- Accessibility and performance need material work, especially image alternatives, form labels, eager multi-megabyte images, and oversized shared assets.

## Estimated project completion

**Approximately 68% complete.**

The customer-facing catalog and product-management foundation are relatively mature. The remaining 32% is disproportionately important: database deployment and contract verification, checkout integrity, guest/member offer completion, production monitoring, accessibility, performance, and regression testing. Feature count alone would make the project appear further along; production risk lowers the practical completion estimate.

# Overall Scores (0–100)

| Area | Score | Explanation |
|---|---:|---|
| Architecture | 67 | The static/Supabase split is understandable, the fallback/published catalog model is strong, and privileged publishing is isolated. The score is reduced by three overlapping product-state layers, global scripts, whole-document JSON persistence, and commerce behavior split between direct table access and RPCs. |
| Code Quality | 52 | Focused modules such as `pricing.js`, `password-reset.js`, and `supabase-config.js` are clear, and syntax is valid. However, `script.js` is 6,279 lines, `admin.js` is 3,113 lines, globals and inline handlers dominate, dead code remains, and several data contracts are serialized into free-form text. |
| Security | 61 | RLS intent, Admin allow-listing, safe Edge Function secrets, ownership checks, test-only deletion, and idempotent order creation are strong. Client-authoritative pricing, public read access to private `site_edits`, unpinned CDN code, missing browser security headers, and unsafe dynamic HTML construction reduce the score. |
| Performance | 45 | Static hosting is fast in principle and there is no framework overhead. In practice, every storefront/auth page loads a 264 KB shared script and 136 KB stylesheet, the image repository is 219 MB, individual images reach 5.7 MB, and no `loading`, `srcset`, or responsive image attributes are used. |
| Maintainability | 43 | Naming is generally descriptive and the newer architecture is documented. Maintainability is constrained by large monoliths, 992 `!important` declarations, 165 repeated exact selector entries, global load-order coupling, duplicated product definitions, and no automated tests. |
| Scalability | 42 | Static catalog delivery scales well for reads, and Postgres/RLS can scale the data layer. The Admin only loads the newest 25 offers/orders, member history is unpaginated, large JSON blobs are rewritten wholesale, and static images are not optimized or delivered through an image CDN. |
| Launch Readiness | 50 | The public storefront is usable and a published snapshot exists. Launch readiness is held back by unverified database deployment, incomplete payment/guest-offer paths, no monitoring or CI, checkout-integrity concerns, and unresolved accessibility/performance issues. |
| Overall Project Score | **55** | This is a capable production prototype with a strong product/Admin foundation, but it is not yet a low-risk commerce system. Stabilizing data integrity, database contracts, authentication initialization, and checkout should precede new features. |

# Strengths

## Architecture and publishing

- `product-catalog.js` remains a reliable default catalog instead of being rewritten on every publication.
- `published-admin-settings.json` is a clean deployable boundary between private Admin work and public storefront state.
- `script.js` handles missing or invalid published JSON by continuing with fallback products.
- Published product records merge over defaults per slug, preserving unspecified default fields.
- The published snapshot supports categories, category order, visibility, image choices, homepage category order, deleted products, ignored image paths, and page visual states.
- The Edge Function authenticates the bearer session and separately checks `admin_profiles`.
- GitHub credentials are retrieved from Edge Function environment variables, never frontend JavaScript.
- Publishing uses the Git data API to create one tree and one commit containing settings plus explicitly selected images.
- Image paths and base64 payload shape/size are validated before GitHub writes.
- Git non-force reference updates reduce the risk of overwriting a concurrently advanced branch.
- Git history provides recovery for published snapshots and image additions.

## Product and image management

- Products are identified by stable slugs and may belong to multiple explicit categories.
- Folder location does not control category assignment.
- Image choices are normalized, deduplicated, and kept inside the parent product.
- One-image products are supported without synthetic choices.
- Admin actions distinguish visibility, category removal, archive/save-for-later, product-record deletion, draft return, and image-choice removal.
- Physical images are not deleted by product or draft workflows.
- `sync-products.py` is intentionally narrow: it inventories supported images and rewrites only `product-drafts.json`.
- Verified website-asset directories are excluded by explicit path rules rather than broad terms such as “light” or “background.”
- Inline Admin visual state uses page/context keys instead of relying solely on image paths.
- Undo/Redo and image-position normalization share state across Admin preview and published rendering.

## Database design

- Customer/profile, product, offer, order, history, discount, and voting concerns have distinct tables.
- Member-owned data is designed for RLS based on `auth.uid()`.
- Admin privilege comes from `admin_profiles`, not a client-side flag.
- Offer messages form a dedicated event/history stream instead of relying only on the current offer row.
- A partial unique index on `order_requests.source_offer_id` prevents duplicate orders for one accepted offer.
- `confirm_offer_payment` is designed to be idempotent.
- Real offer/order records are archived; permanent deletion is restricted to marked test data.
- Test Mode records have explicit flags and payment destinations are suppressed in frontend test paths.
- Security-definer functions set an explicit `search_path`.
- The catch-up migration is wrapped in one transaction and contains preflight type/constraint checks.
- History backfills use `not exists` guards to avoid duplicate initial events.

## User experience and focused modules

- Shared height pricing lives in the small, reusable `pricing.js` module.
- Password recovery is isolated in `password-reset.js` rather than mixed into Admin code.
- Member account output is escaped before dynamic insertion.
- Offer and checkout actions show errors returned by Supabase instead of reporting unconditional success.
- Manual payment instructions clearly state that payment is confirmed manually.
- The account area separates active offers, past offers, orders, discounts, and password/account access.
- Category pages share a generic data-driven renderer, with a specialized sports showroom where needed.
- The entire repository is deployable without a frontend build tool or application server.

# Critical Problems

Only production-, data-, checkout-, publishing-, login-, Admin-, product-, image-, or security-critical issues are included here.

## 1. Live database contract is not proven current

**Files:** `script.js`, `admin.js`, `member-account.js`, `supabase-schema.sql`, `supabase/migrations/20260718120000_catch_up_offer_account_order_schema.sql`, `SUPABASE_DEPLOYMENT.md`

The frontend calls `respond_to_member_offer`, `submit_test_offer`, `prepare_offer_payment`, `submit_offer_payment`, `confirm_offer_payment`, `admin_update_order_status`, and other RPCs. Repository documentation says the catch-up migration has not yet been deployed. Missing objects break offer responses, payment preparation, payment confirmation, order creation, Test Mode, discounts, and account history.

Why it matters: a customer can complete UI steps that fail at persistence time, and an Admin can see controls that cannot safely update production records.

## 2. Order prices are not authoritative on the server

**Files:** `script.js:940`, `supabase-schema.sql`, catch-up migration `submit_order_request`

The browser supplies item names and prices. The RPC sums those submitted prices and checks that the result equals the separately submitted original amount. Both values are controlled by the caller; the server does not look up an authoritative product/configuration price. A direct API caller can submit internally consistent but false or zero prices.

Why it matters: this is a checkout-integrity and revenue risk. Manual payment review reduces but does not eliminate the risk of an underpriced order being treated as legitimate.

## 3. The fallback checkout path bypasses the secure order RPC

**File:** `script.js:1010-1029`

When `submit_order_request` is missing, the browser falls back to a direct insert into `order_requests` for ordinary non-discount, non-test checkout. Older schema policy allows broad direct insertion, including caller-supplied totals and status.

Why it matters: a missing security migration silently changes the checkout trust model instead of stopping safely. The customer sees success even though the secure validation/audit path was not used.

## 4. Sign-in binding depends on optional asynchronous storefront initialization

**Files:** `signin.html`, `script.js:6201-6205`, `script.js:2332-2358`

The sign-in form uses the full storefront `script.js`. Its submit handler is not attached until after session synchronization and a Test Mode RPC attempt. Before binding, the form has no explicit safe action and a user click can perform native navigation/reload. Any slow/missing RPC, CDN delay, or earlier exception can recreate the observed “refresh and remain on sign-in” failure.

Why it matters: authentication is a production entry point and should not depend on optional commerce/Admin initialization.

## 5. Admin JSON state uses whole-record, last-write-wins updates

**Files:** `admin.js:148-192`, `script.js:2787-2807`, `script.js:4382-4417`, Edge Function `writeAdminGlobal`

Product/Admin state is merged in the browser and the complete `site_edits.edits` JSON document is upserted. Separate tabs or Admin sessions can read different versions and overwrite each other. The publishing Edge Function also reads the entire `admin-global` object before the GitHub commit and writes that older object back afterward with publish history.

Why it matters: a concurrent product save during publishing can be silently overwritten, losing approved products, categories, image relationships, ordering, or other Admin work.

## 6. Publishing does not verify every snapshot image against the target GitHub tree

**Files:** `admin.js:830-975`, `supabase/functions/publish-admin-changes/index.ts:211-320`

Explicitly selected image files are checked locally and confirmed absent from GitHub. Product image paths already present in the snapshot are validated only for path syntax, not existence in the target repository. An Admin can publish settings that reference a new local image but omit it from the explicit image list.

Why it matters: the publication can succeed while creating broken public product cards or image choices.

## 7. Admin commerce queues silently omit records beyond the newest 25

**File:** `admin.js:1439-1442`

The Admin fetches only the 25 newest offers and 25 newest orders, then divides only those rows into status queues. There is no pagination or separate query per pending status.

Why it matters: an older unresolved pending offer/order can disappear from the visible Admin workflow even though it remains in the database. This can cause missed customer work and appears equivalent to lost data operationally.

## 8. Database installation guidance conflicts, and the cumulative schema is not safely rerunnable

**Files:** `NEXT_LAUNCH_STEPS.md`, `supabase-schema.sql`, `supabase-live-admin-fix.sql`, `SUPABASE_DEPLOYMENT.md`

Older launch documentation advises running the full `supabase-schema.sql`; the newer guide says not to use it as the catch-up migration. The cumulative schema contains unguarded `create policy` statements and is not wrapped in one transaction, so rerunning it on a partially configured project can stop after some changes. The focused live-Admin SQL is also not fully rerunnable.

Why it matters: following stale operational documentation can leave the production database partially migrated, break RLS, or make frontend/database contracts inconsistent.

# JavaScript Review

## Repository-wide findings

- No duplicate top-level function declaration was found within `script.js` or `admin.js`.
- There are no ES module imports and therefore no formal circular module dependencies. Instead, the site has implicit global/load-order dependencies across `supabase-config.js`, `pricing.js`, `product-catalog.js`, and the page runtime.
- Global functions are called through many inline HTML `onclick`/`onsubmit` attributes, making dead-code detection and refactoring more difficult.
- Repeated helper logic exists across files: money/date/HTML escaping, Supabase-client wrappers, offer-message parsing, product/image-choice normalization, browser-storage fallback, clamping, and Admin-state merging.
- Large template strings mix data, markup, event wiring, and business rules.
- Many operations replace complete containers with `innerHTML`, then rebind listeners.
- Optional initialization errors are frequently caught and ignored. This keeps pages alive but makes root causes difficult to diagnose.

## `script.js`

**Size:** 6,279 lines / 263,775 bytes; approximately 310 named function declarations.

**Responsibilities:** cart, checkout, manual payment, discounts, offers, counteroffers, auth, search, filters, fan voting, product catalog merging, category rendering, sports/generic showrooms, standee details, size pricing, Admin preview, inline editing, visual persistence, toolbar, history, and page initialization.

**Very large/high-complexity areas:**

- `installInlineAdminMode` and its pointer/keyboard/edit lifecycle.
- `submitCheckoutRequest` and `submitOfferRequest`.
- `setupGenericCategoryShowroom`, `renderStandeeDetailPage`, and `getSelectedProduct`.
- Inline toolbar drag/resize and dynamic card-control construction.
- The single `DOMContentLoaded` initializer coordinates unrelated page systems.

**Confirmed dead/unreferenced function candidates:** `getAutoAcceptResult`, `commentFromOfferDetails`, the `script.js` copy of `clearLegacyAdminBrowserStorage`, `getProductAdminKey`, `getGenericCategoryOptionLabel`, `toggleAdminSizeEditor`, `installSizeAdmin`, `clearCurrentPageBrowserAdminEdits`, `hideSelectedInlineAdminCard`, `restoreInlineHiddenCards`, and `replaceSelectedInlineAdminImage`. These names appear only at their definitions across project HTML/JS.

**Possible bugs and inconsistencies:**

- Auth form binding is delayed by unrelated async initialization.
- Member duplicate-offer checks omit `payment_pending`, although account/Admin status grouping treats it as active.
- Non-offer real “I've Completed Payment” feedback is local UI only; it does not update a normal order record.
- Checkout retains a direct-insert fallback that bypasses secure RPC behavior.
- Dynamic product markup interpolates Admin-authored titles, descriptions, image paths, hrefs, and slugs without a common HTML/attribute escaping function.
- `getManagedProductCatalog` recomputes and merges the catalog repeatedly rather than caching one immutable result per load.
- Auth state is mirrored in localStorage. Server checks correct it on load, but multiple sources can briefly disagree.
- Signup sets local “signed in” state even when Supabase returns no session pending email confirmation.
- Multiple product definitions exist in the fallback catalog, `standeeCatalog`, homepage markup, and published snapshot.

**Recommendation:** First extract isolated auth initialization and trusted order/offer APIs. Then split catalog/rendering, commerce, fan features, and inline editing behind regression tests. Do not perform a wholesale rewrite.

## `admin.js`

**Size:** 3,113 lines / 140,376 bytes; approximately 148 named function declarations.

**Responsibilities:** Admin authorization, private settings, diagnostics, product lifecycle, drafts, image choices, commerce queues, Test Mode, pricing, discounts, extra images, import/export, and GitHub publishing.

**Very large/high-complexity areas:** `renderAdminProducts` (more than 200 lines), publish-diff generation, commerce refresh/routing, draft rendering, coupon setup, and preview-control binding.

**Confirmed dead/unreferenced function candidate:** `addImageChoiceToProduct` appears only at its definition.

**Possible bugs and inconsistencies:**

- Commerce queries are capped at 25 without pagination.
- Full JSON state is rewritten, allowing stale/concurrent overwrite.
- Some product values are escaped, but product headings, title input values, descriptions, slugs in IDs, and some template attributes are inserted raw.
- Product/image uploads become data URLs in private state, while publish logic falls back to the previous repository image or removes data-URL choices. The UI does not make this publication limitation sufficiently explicit.
- Admin status/history links hard-code the GitHub repository URL while the Edge Function uses environment-configured owner/repository values.
- Direct Admin offer updates rely on RLS and UI validation rather than a dedicated transition RPC; malformed or out-of-order states are possible through another authenticated Admin client.

**Recommendation:** Split persistence, commerce, product/draft, and publishing modules after adding contract tests. Introduce atomic versioned state updates and server-side offer transition functions.

## `member-account.js`

**Size:** 257 lines / 12,205 bytes.

**Strengths:** Focused scope, consistent escaping, clear active/past grouping, dedicated timeline, and RPC-based member responses.

**Issues:** It loads all visible offers/orders without pagination; offer configuration is parsed from newline-delimited `offers.message`; order details/history are not rendered; `payment_pending` lacks a friendly label; and the page depends on database objects that may not be deployed.

## `password-reset.js`

**Size:** 97 lines / 3,531 bytes.

**Strengths:** Isolated from the main storefront, uses a fixed origin allow-list, shows exact errors, and validates password confirmation.

**Issues:** Production success depends on Supabase URL allow-list configuration that cannot be verified statically. It does not verify password-strength rules beyond eight characters.

## `pricing.js`

**Size:** 70 lines / 2,367 bytes.

**Strengths:** Small, cohesive, immutable public API, shared by Admin and storefront, and tolerant height parsing.

**Issues:** No automated boundary tests exist for feet/inches parsing, interpolation points, invalid heights, or Admin setting changes. The server does not reuse this authoritative calculation.

## `product-catalog.js`

**Size:** 87 lines / 6,802 bytes.

**Strengths:** Compact fallback catalog, explicit category routing, stable slugs, multi-category support, and optional image choices.

**Issues:** Some primary image paths are intentionally reused by multiple explicit product records; several hidden placeholder records remain; data overlaps with homepage markup, `standeeCatalog`, published JSON, and relational database tables.

## `supabase-config.js`

**Size:** 16 lines / 586 bytes.

**Strengths:** One shared client; only the public project URL and publishable key are exposed.

**Issues:** Session persistence and token refresh rely on Supabase defaults instead of explicit options. The CDN dependency is loaded separately by every page and is not version-pinned beyond major version 2.

## `supabase/functions/publish-admin-changes/index.ts`

**Size:** 413 lines / 18,651 bytes.

**Strengths:** Structured errors, Admin authentication, server-only GitHub token, origin allow-list, payload/image limits, path traversal checks, duplicate fingerprint protection, non-force Git updates, and one-commit publication.

**Issues:** Snapshot image existence is not fully verified; GitHub success and Supabase history update are non-atomic; stale `site_edits` can be written after the commit; publish history grows without a retention limit; and a history-save failure makes a successful GitHub commit appear failed.

# HTML Review

## Files, links, and markup

- All 19 HTML files referenced by navigation or scripts exist.
- All local HTML, JavaScript, CSS, and static image references found in HTML resolve.
- No duplicate static IDs were found within any page.
- All documents declare `lang="en"` and include a viewport meta tag.
- Homepage hash targets (`home`, `shop`, `fan-requests`, `why-customers`, `custom`, and `contact`) exist.
- No GitHub Actions workflow or generated route manifest exists; navigation is direct static-file navigation.
- Modern HTML permits the descriptive `<p>` elements inside sports category-card anchors, although older `tidy` reports them as legacy warnings.

## Accessibility issues

- `index.html` contains 43 images with empty `alt`; many backgrounds are decorative, but product cutouts inside image-only links also have empty alternatives, leaving those links unnamed to assistive technology.
- Generic category background carousels use empty alternatives even when they are selectable/display-relevant.
- Search and category-filter controls have no associated visible or screen-reader label.
- Numerous homepage and standee buttons omit `type="button"`. They are currently outside forms, but explicit types would prevent future accidental form submission.
- Icon-only close/cart controls do not consistently provide accessible names.
- Dynamically injected offer, checkout, Admin, and toolbar interfaces need keyboard/focus-trap testing; no automated accessibility checks exist.
- Modal markup does not consistently declare dialog semantics, `aria-modal`, initial focus, focus restoration, or Escape handling.

## Forms and navigation

- Auth forms have JavaScript handlers but no safe fallback action. If the handler is delayed or fails, native submission reloads the page.
- Sign-in and signup fields are not marked `required` in HTML; validation is deferred to Supabase.
- Checkout inputs use useful autocomplete attributes and required shipping fields.
- Guest offer name/email fields are not HTML-required even though they are operationally necessary for follow-up.
- Dynamic forms rely on inline `onsubmit`, increasing dependence on the global runtime.
- Category pages have empty data containers and no usable no-JavaScript fallback product cards; failure of shared JavaScript leaves them empty.

## Invalid/stale content concerns

- Ampersands appear unescaped in several titles/headings. Browsers recover, but `&amp;` is the correct source form.
- `standee.html` intentionally starts with an empty modal image `src`; this can trigger an unnecessary same-page request in some browsers before JavaScript replaces it.
- `NEXT_LAUNCH_STEPS.md` and the one-page “Next Steps” PDF describe an older project state and conflict with current database deployment guidance.

# CSS Review

## Size and organization

`style.css` is 6,654 lines / 136,142 bytes and serves every customer, account, authentication, category, Admin, and inline-editor page.

The file is organized through comments, but later “final,” “cleanup,” “polish,” and compact-override sections repeatedly supersede earlier definitions. Component and mobile rules are often separated by thousands of lines.

## Duplicate and conflicting rules

A static selector scan found approximately **839 unique selector entries** and **165 exact selectors defined more than once**. Some duplicates are intentional responsive overrides or keyframe percentages, but many are cascade patches. Notable repeated selectors include:

- `#shop .button-row` (four definitions).
- `#shop .button-row .offer-btn` (four definitions).
- `.fan-rule-grid` and `.fan-steps-grid` (four definitions each).
- `.admin-anywhere-toolbar` and several size/collapsed variants (multiple definitions).
- `.auth-links`, `.category-fact-grid`, `.category-option-strip`, information carousel classes, member order cards, and standee action layouts.

The stylesheet contains approximately **992 `!important` declarations**, indicating that specificity and ordering are routinely being overridden rather than normalized.

## Candidate unused/legacy selectors

Static cross-reference analysis found 31 candidate class names not present in current HTML/JS strings. Some may be generated indirectly, so they require browser coverage before removal. Candidates include `admin-commerce-grid`, `admin-size-toggle`, `admin-tool-danger`, `admin-tool-primary`, `bg-options-btn`, `info-dots`, `offer-message-buyer`, `offer-message-seller`, `offer-message-system`, `pay-link`, `request-list`, `seller-counter-tools`, `signed-in-name`, and `size-select`.

## Mobile and responsive risks

- Breakpoints are distributed across many blocks at 1,000, 860, 850, 820, 760, 720, 650, 620, and 560 pixels, making precedence hard to predict.
- Fixed-position carts, modals, Admin toolbars, and resize handles rely heavily on late `!important` rules.
- Horizontal category/player carousels intentionally overflow, but keyboard and touch behavior need real-device testing.
- Large fixed minimum widths inside grid rules are overridden later for mobile; missing one override can create horizontal scrolling.
- There is no automated screenshot or visual-regression suite.

## Recommended CSS direction

Do not reorder the current file directly. First add screenshot coverage, then extract design tokens/base rules, storefront components, commerce/auth/account, Admin dashboard, and inline editor layers. Remove duplicates only when computed-style comparisons prove equivalence.

# Product System Review

## Current data layers

1. `product-catalog.js`: 37 fallback product records and 10 category routes.
2. `published-admin-settings.json`: 39 published products and 11 category display cards.
3. Supabase `site_edits`: private Admin product/settings state.
4. `admin.js`: 11 hard-coded homepage/category display-card defaults.
5. `script.js` `standeeCatalog`: specialized product/showroom fallback data.
6. Relational `products` and `product_images` tables: defined in SQL but not the active public catalog source.

This works, but ownership is diffuse and drift is possible.

## Products and categories

- Published snapshot: 39 products; 35 visible and 4 hidden.
- Published-only custom products: `jesus-welcome` and `jesus-welcome-2`.
- All 37 fallback products are represented in the published snapshot.
- No product/category-display slug overlap exists.
- No invalid published category keys were found.
- Current visible category counts: Sports 7; Movie Characters 3; People/Public Figures 3; Music Artists 3; Faith/Celebration 3; Holiday 3; Dinosaur/Animal 3; Fan Requests 1; Video Game/Fantasy 3; Custom/Other 6.
- Several products intentionally share primary image paths. This is allowed because they are separate explicit records, but it can confuse inventory audits.

## Image choices

- `celebration-display` contains two real alternate choices and does not duplicate its primary path.
- No published image-choice path is owned by more than one product.
- No published choice path is also a primary product image.
- Normalization removes duplicate choice paths and choices equal to the current primary image.
- Admin supports add, rename, move, and remove relationships without deleting image files.

## Drafts, approved, archived, and deleted records

- `product-drafts.json` parses and contains 53 unique records; every draft file exists.
- The scanner’s current rules would produce 63 drafts from the present repository.
- Two current draft entries are stale because they are already published products: `images/FaithCelebrationStandees/Jesus/J5L.png` and `images/FaithCelebrationStandees/Jesus/J5printD.png`.
- Twelve newly added product images are absent from the current draft JSON; see Image System Review.
- Published snapshot has zero deleted-product slugs and zero ignored paths.
- “Archived” is represented by Admin state and published `visible: false`; four fallback placeholders are currently hidden.
- Product-record deletion is a relationship/state operation, not a physical-file deletion.

## Inconsistencies and risks

- Draft inventory is manual and therefore predictably stale between scanner runs.
- Approved/private products can exist in `site_edits` without appearing in the public snapshot until publication.
- Browser storage still shadows several Admin keys for compatibility and can temporarily diverge from Supabase.
- Homepage display cards are distinct from individual products, but both use similarly shaped records and shared render helpers.
- Relational database products are not synchronized with the active file-based catalog, creating an unused alternate source of truth.
- Uploaded data URLs cannot be deployed as repository images through the normal product form alone; explicit repository paths and publish selection are required.

# Image System Review

## Inventory results

- Supported repository image files: **178**.
- Total image-directory size: approximately **219 MB**.
- Unique image paths referenced by text/configuration: **142**.
- Missing referenced image paths: **0**.
- Unreferenced image files: **36**; 24 are website/business/front-page/hero assets or legacy copies, and 12 are new product images not yet in drafts.
- Exact binary duplicate groups: **2**.
  - `images/Business/logogold.png` and `images/Herobackgroundparts/logogold.png`.
  - `images/Herobackgroundparts/hero10E.png` and `images/MovieCharacterStandees/Endorskeleton/Endornobackground.png`.

Duplicate content is not automatically a defect; paths may carry different semantic roles. No file should be removed without visual and relationship review.

## New product images absent from drafts

The scanner has not been run against these 12 present files:

- `images/MusicArtistStandees/MichaelJackson/MJbeatit/MJ1white1.png`
- `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJMOONWALKblackbackground.png`
- `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJMOONWALKbluebackground.png`
- `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJMOONWALKlightbluebackground.png`
- `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJSmoothCriminal.png`
- `images/MusicArtistStandees/MichaelJackson/SmoothCriminal/MJSmoothCriminalnobackground.png`
- `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunk.png`
- `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunkblackbackground.png`
- `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunknobackground.png`
- `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunknormal.png`
- `images/SportLegendStandees/Kobe/KobeBackDunk/KBdunkyellowbackground.png`
- `images/SportLegendStandees/Kobe/KobeyLayout/KBlayup.png`

## Performance and handling concerns

- No HTML/JS image uses `loading="lazy"`, `decoding="async"`, `srcset`, or responsive `sizes` attributes.
- Largest files include a 5.67 MB website background, two dinosaur images above 3.5 MB, and multiple product cutouts around 2.5-3.2 MB.
- Some cutouts are around 1,200 x 2,400 pixels and are downloaded even when rendered as small cards.
- The homepage eagerly declares many stage/background/cutout images.
- The Edge Function accepts up to 20 images and 40 million base64 characters per publication, which can pressure browser memory and Edge request limits.
- File naming includes spaces, apostrophes, a `.png.jpg` double extension, and likely typos. Current path validation supports spaces/apostrophes, but naming increases tooling and URL-encoding risk.
- The scanner searches only supported extensions and root-level source files; it intentionally does not discover references inside nested tooling/Edge files, although current product paths live in scanned root data.

# Database Review

## Tables and relationships

The repository expects `profiles`, `admin_profiles`, `categories`, `products`, `product_images`, `site_edits`, `offers`, `offer_messages`, `order_requests`, `order_events`, `discount_codes`, `discount_redemptions`, and `fan_votes`.

Relationships are generally sound:

- Profiles/Admin/customer references point to `auth.users`.
- Product images belong to products; products optionally belong to categories.
- Offer messages belong to offers.
- Order events belong to orders.
- Paid offers link to one order through `source_offer_id` and a unique partial index.
- Discount redemptions link codes to customers/guests and offers/orders.

## Frontend/RPC contract

The frontend RPC names and parameter names match the catch-up migration:

| RPC | Frontend callers | Contract result |
|---|---|---|
| `get_admin_test_mode` | `admin.js`, `script.js`, `member-account.js` | Match |
| `set_admin_test_mode` | `admin.js` | Match |
| `submit_test_offer` | `script.js` | Match |
| `validate_discount_code` | `script.js` | Match |
| `submit_order_request` | `script.js` | Match |
| `prepare_offer_payment` | `script.js` | Match |
| `submit_offer_payment` | `script.js` | Match |
| `respond_to_member_offer` | `script.js`, `member-account.js` | Match |
| `confirm_offer_payment` | `admin.js` | Match |
| `admin_update_order_status` | `admin.js` | Match |
| `update_test_order_status` | `script.js` | Match |
| `record_test_order_event` | `script.js` | Match |
| `list_eligible_discounts` | `member-account.js` | Match |

Static matching does not prove these functions exist live.

## Triggers, indexes, and idempotency

- Offer updated-at, duplicate-active-offer, new-history, and update-history triggers are defined in dependency order.
- Auth profile and fan-vote cooldown triggers live in the cumulative schema but not the focused catch-up migration.
- Source-offer uniqueness correctly protects against duplicate paid-offer orders.
- Discount indexes support code and usage lookups.
- Catch-up backfills only null `updated_at` values and missing initial/comment events.
- The catch-up migration is transactional and designed to roll back on preflight failure.

Risks:

- `supabase-schema.sql` is not fully idempotent because several policies are created without guards/drop statements.
- `supabase-live-admin-fix.sql` is also not fully rerunnable.
- If an existing `discount_codes` table has the right columns but lacks expected checks/foreign keys, `CREATE TABLE IF NOT EXISTS` will not add those constraints; the migration validates column types more thoroughly than constraint completeness.
- Creating the case-insensitive unique code index will fail safely if existing rows contain case-variant duplicate codes.
- `gen_random_uuid()` assumes the normal Supabase extension environment; the migration does not explicitly create an extension.
- Status values are text rather than a centralized enum/check in the new schema, allowing Admin direct updates to create unsupported states.

## RLS and permissions

Strengths:

- Member-owned SELECT policies are tied to `auth.uid()`.
- Guest/member offer INSERT policies constrain ownership, status, amount, Test Mode, payment, and archive fields.
- Admin SELECT/UPDATE is based on `is_current_user_admin()`.
- Real orders/offers cannot be deleted through the intended restrictive Test Mode policies.
- Direct order insert is revoked by the catch-up migration.
- Security-definer functions use `public, pg_temp` search paths and check ownership/Admin access.

Concerns:

- `site_edits` has an “Anyone can view site edits” policy. Since `admin-global` contains private approved products, draft workflow data, ignored paths, and publish history, unauthenticated users can query unpublished Admin state through Supabase even though storefront rendering ignores it.
- The cumulative schema grants authenticated table UPDATE/DELETE broadly and relies on RLS for enforcement. This is valid but increases the impact of an accidental policy regression.
- `submit_order_request` is security-definer and price-authority is insufficient.
- Direct Admin offer UPDATE is allowed rather than requiring a transition RPC.
- No live policy inventory or runtime adversarial test was possible in this static audit.

# Publishing Review

## End-to-end design

The intended flow is coherent:

1. Admin state persists in Supabase `site_edits`.
2. `admin.js` waits for queued saves and reloads persisted state.
3. It builds a generic snapshot and human-readable change summary.
4. Explicit image paths are loaded as binary data.
5. The Edge Function authenticates Admin access.
6. The Edge Function validates the snapshot and creates one GitHub commit.
7. Publish history and the last published snapshot are written to Supabase.
8. Static deployment serves `published-admin-settings.json` publicly.
9. Storefront pages load and merge it over the fallback catalog.

## Current snapshot health

- `publishedAt` is non-null: `2026-07-16T07:11:48.743Z`.
- Snapshot JSON parses and is version 1.
- 39 products and 11 category display cards are present.
- Both `jesus-welcome` products are included.
- No image reference in the snapshot is missing locally.
- No duplicate product/card slugs exist.
- No deleted products or ignored image paths are currently published.
- `pageVisualStates` is currently empty, so no page-specific inline visual changes are represented by that collection in the committed snapshot.

## Data-loss and synchronization risks

- GitHub commit and Supabase history are not one transaction. A commit can succeed and the response still fail at history save.
- Retrying after a history-save failure may create another commit because the fingerprint was not recorded.
- The Edge Function writes a stale full `admin-global` JSON object after publication and can overwrite concurrent Admin edits.
- Snapshot image references are not all checked against the target GitHub tree.
- Image inventory synchronization is manual; current drafts are stale by 14 net relationships (12 missing, 2 obsolete).
- `product-catalog.js`, homepage markup, Admin display defaults, `standeeCatalog`, and published JSON can drift independently.
- No GitHub Actions workflow validates syntax, links, image existence, snapshot shape, or deployment after a publishing commit.
- Publishing commits directly to the configured branch, potentially `main`, without a PR/CI gate.
- Publish history is stored inside the growing `site_edits` JSON document and is never compacted.

# Security Review

## Authentication and Admin access

- Supabase Auth is the actual session authority; localStorage mirrors UI state but does not grant database Admin rights.
- Admin access is checked against `admin_profiles` in browser RLS paths and independently in the publishing Edge Function.
- Password reset uses allowed origins rather than arbitrary return URLs.
- Sign-in and signup are too coupled to the full storefront runtime, creating an availability risk.
- Signup temporarily sets signed-in local state before a confirmed session exists.

## Supabase and database

- The browser URL and publishable key are safe to expose when RLS is correct.
- No service-role key is present in the repository.
- RLS design is generally least-privilege for member data.
- Public `site_edits` SELECT exposes unpublished Admin data.
- Server-side order pricing is not authoritative.
- Live RLS, function owners, grants, and Auth redirect settings remain unverified.

## Edge Function and GitHub

- GitHub token and repository settings are server environment values.
- Admin membership is verified before GitHub operations.
- Image paths reject traversal and backslashes; image count/size is limited.
- CORS is restricted to configured production/localhost origins, although CORS is not an authorization control.
- Published product text is not sanitized for HTML because the storefront inserts some fields via `innerHTML`. A compromised/malicious Admin account could publish persistent script-capable markup.
- Edge error responses do not reveal token values.

## Browser/application security

- Supabase JavaScript is loaded from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` without an exact version or Subresource Integrity.
- No Content Security Policy, Permissions Policy, Referrer Policy, or repository-managed security headers are present.
- Inline event handlers make a strong CSP difficult without refactoring.
- Dynamic product/Admin markup inconsistently escapes trusted Admin content.
- External payment links open with `noopener,noreferrer` in the payment code, which is good.
- No raw card data is collected or stored.
- There is no automatic payment processor, so the site must not imply card authorization/capture.

# Performance Review

## Asset weight

- `script.js`: 263.8 KB unminified.
- `style.css`: 136.1 KB unminified.
- `published-admin-settings.json`: 30.3 KB.
- `admin.js`: 140.4 KB on Admin.
- Supabase browser library: additional third-party transfer on every data-enabled page.
- Images directory: approximately 219 MB; largest individual file is about 5.67 MB.

Auth pages load pricing and the full storefront runtime even though sign-in requires only a small fraction of it.

## Rendering and network behavior

- No responsive/lazy image attributes are used.
- The homepage declares dozens of images up front.
- Each storefront page fetches published settings with `cache: no-store`, prioritizing freshness over repeat navigation cost.
- Signed-in pages perform Supabase session and Test Mode calls during general initialization.
- Admin loads all `site_edits` rows and full JSON documents.
- Member account loads all visible offers and orders with no pagination.
- Catalog merge/filter functions repeatedly rebuild arrays/maps during page interactions.
- Large `innerHTML` replacement is used for product grids, Admin product sections, commerce queues, histories, and options.
- Many listeners are installed across the large shared DOM. No confirmed duplicate listener was found in static initialization, but rerender behavior is difficult to prove without browser tests.
- Inline editing keeps snapshots/history and large data URLs in browser memory; base64 publication expands binary size by roughly one third.

## Positive performance characteristics

- Static hosting and CDN delivery avoid server rendering overhead.
- There is no framework runtime, bundler bootstrap, or hydration cost.
- Product data volumes are currently small.
- The published catalog is only about 30 KB.
- The inline Undo/Redo history is intentionally bounded.

# Launch Checklist

| Item | Status | Notes |
|---|---|---|
| Production domain/CNAME configured | Done | `CNAME` contains `mvpluxcreations.com`. |
| Core homepage and category pages present | Done | All expected static pages exist. |
| Fallback product catalog | Done | 37 fallback records. |
| Public published snapshot | Done | Valid snapshot with 39 products. |
| Local image references resolve | Done | Zero missing referenced paths. |
| Shared height pricing | Done | Storefront/Admin module present. |
| Cart and manual-payment UI | Done | Implemented for Zelle, PayPal, Venmo, and Cash App. |
| Supabase browser client configuration | Done | Shared singleton and public key only. |
| Secure GitHub publishing Edge Function | Done | Code present; operational secrets/runtime still require verification. |
| Admin product/draft/image-choice UI | Done | Broad implementation present. |
| JavaScript/TypeScript/Python/JSON syntax checks | Done | Passed in this audit. |
| Deploy catch-up database migration | Needs Work | Migration exists but is not proven deployed. |
| Verify live RLS/RPC contracts | Needs Work | Must be tested against the connected project. |
| Make server authoritative for product prices | Needs Work | Current RPC trusts caller-supplied prices. |
| Remove insecure checkout fallback | Needs Work | Stop safely if secure RPC is unavailable. |
| Isolate sign-in initialization | Needs Work | Do not depend on storefront/Test Mode startup. |
| Add Admin commerce pagination/status queries | Needs Work | Current limit hides older work. |
| Make Admin state updates atomic/versioned | Needs Work | Prevent stale JSON overwrite. |
| Verify every published image exists in GitHub | Needs Work | Validate snapshot references before commit. |
| Synchronize current image drafts | Needs Work | 12 missing and 2 stale entries. |
| Complete guest accepted-offer notification/payment path | Needs Work | No account or verified email notification. |
| Persist direct-order payment-submitted state | Needs Work | Current real path shows local feedback only. |
| Production Auth redirect configuration | Needs Work | Static code cannot verify dashboard settings. |
| Email notifications | Not Started | No email provider/Edge Function found. |
| Automatic payment authorization/capture | Not Started | Manual payment only. |
| Payment webhooks and reconciliation | Not Started | No processor integration. |
| Automated unit/contract tests | Not Started | No test framework/files found. |
| CI/deployment validation workflow | Not Started | No `.github/workflows` found. |
| Error monitoring/observability | Not Started | Console warnings and UI status only. |
| Accessibility audit and fixes | Needs Work | Alt text, labels, dialogs, focus, keyboard testing. |
| Responsive image optimization | Needs Work | No lazy loading/srcset; multi-megabyte assets. |
| Security headers/CSP | Not Started | Static inline-handler architecture complicates CSP. |
| Backup/restore drill | Needs Work | Manual guide exists; no verified drill evidence. |
| Real-browser regression suite | Not Started | No automation present. |
| Update stale launch/PDF documentation | Needs Work | Older instructions conflict with catch-up guide. |

# Technical Debt

## Critical

| File(s) | Explanation | Recommended fix | Difficulty | Change risk |
|---|---|---|---|---|
| `script.js`, migration, live Supabase | Frontend depends on unverified RPC/schema deployment. | Back up live data, inventory objects, deploy the reviewed catch-up migration atomically, then run isolated test-record lifecycle checks. | High | High |
| `script.js`, order RPC | Client controls order item prices and total inputs. | Introduce a server-authoritative product/configuration price contract or signed quote; calculate final totals only in a secure RPC. | High | High |
| `script.js:1010-1029` | Direct order fallback bypasses secure validation. | Remove fallback after database deployment; fail visibly if secure RPC is missing. | Low | Medium |
| `signin.html`, `script.js` | Sign-in handler waits on optional storefront/Test Mode initialization. | Use a small isolated auth initializer loaded immediately; preserve existing Supabase session behavior. | Medium | High |
| `admin.js`, `script.js`, Edge Function, `site_edits` | Whole-JSON last-write-wins can erase Admin work. | Add revision/version checks or atomic JSON patch RPCs; have publishing update only history fields against the latest row. | High | High |
| `admin.js`, Edge Function | Snapshot may reference an image absent from GitHub. | Send/derive the full referenced-image manifest and verify every path against the target tree before commit. | Medium | Medium |
| `admin.js` | Only newest 25 commerce records are visible. | Query queues by status with pagination and unresolved-count diagnostics. | Medium | Medium |
| `supabase-schema.sql`, deployment docs | Conflicting/non-idempotent installation paths can partially migrate production. | Declare one canonical migration path; mark cumulative schema reference-only; make all operational SQL transactional/idempotent. | Medium | High |

## High

| File(s) | Explanation | Recommended fix | Difficulty | Change risk |
|---|---|---|---|---|
| `script.js` | 6,279-line global runtime couples auth, commerce, catalog, and editor. | Extract one subsystem at a time behind browser/contract tests. | High | High |
| `admin.js` | 3,113-line Admin runtime combines unrelated domains. | Split persistence, product/draft, commerce, and publishing modules. | High | High |
| `style.css` | 6,654 lines, 165 repeated selector entries, about 992 `!important` declarations. | Add screenshot tests; consolidate by component without changing cascade behavior. | High | High |
| `images/`, HTML/JS rendering | 219 MB of assets and no responsive/lazy delivery. | Preserve originals; add derived web renditions through a separate reviewed asset pipeline and responsive markup. | High | Medium |
| `supabase-schema.sql` `site_edits` policy | Unauthenticated users can read unpublished Admin state. | Publish public state only through JSON; restrict private `site_edits` reads to Admin where public reads are no longer required. | Medium | High |
| `script.js`, `admin.js` dynamic templates | Inconsistent escaping of Admin-authored values can produce stored markup/XSS. | Centralize text/attribute/URL encoding or build DOM nodes with `textContent`; validate published text. | Medium | High |
| Entire repository | No automated tests or CI. | Add syntax, JSON/schema, link/image, catalog integrity, DOM handler, and critical browser smoke tests before refactors. | High | Low |
| `member-account.js`, `admin.js` | Unbounded member queries and capped Admin queries do not scale correctly. | Add indexed status/date pagination and explicit “load more”/counts. | Medium | Medium |
| `offers.message`, three JS files, SQL triggers | Product configuration is encoded in newline-delimited text and parsed repeatedly. | Add structured JSON/columns for product slug, image, size, background, asking price, and comment; retain legacy parser for old rows. | High | High |
| Checkout/account/Admin | Guest accepted offers have no verified notification/return channel. | Add minimal transactional email notifications through a secure server function and a signed guest offer link. | High | High |
| Payment paths | Manual payment has no webhook verification or reconciliation. | Keep manual confirmation explicit; add processor integration only as a separate audited project. | High | High |

## Medium

| File(s) | Explanation | Recommended fix | Difficulty | Change risk |
|---|---|---|---|---|
| `product-drafts.json`, `sync-products.py` | Inventory is currently 12 images behind and retains two published drafts. | Run scanner only after approval; add a read-only CI inventory-drift check. | Low | Low |
| `product-catalog.js`, `admin.js`, `script.js`, `index.html`, published JSON | Product/display definitions overlap. | Document one owner for each record type and generate derived views without rewriting fallback data. | High | High |
| `script.js` | At least 11 named functions appear unreferenced. | Remove only after browser coverage confirms no inline/dynamic invocation. | Low | Medium |
| `admin.js` | One image-choice helper appears unreferenced. | Verify and remove in a focused cleanup. | Low | Low |
| Auth code | LocalStorage mirrors server session and signup marks a pending-confirmation account signed in. | Derive auth UI directly from Supabase session events; keep local values cosmetic only. | Medium | Medium |
| HTML pages | Product cutouts/image links lack useful alt text; search/filter labels absent; modal semantics incomplete. | Perform WCAG-oriented semantic/focus pass with keyboard and screen-reader testing. | Medium | Medium |
| Supabase CDN includes | Major-version-only dependency without SRI can change unexpectedly. | Pin an exact reviewed version or self-host a verified build; add integrity/crossorigin where practical. | Low | Medium |
| Edge Function | Publish history grows inside one JSON object. | Move history to an append-only table or cap retained entries while preserving Git history. | Medium | Medium |
| `SUPABASE_DEPLOYMENT.md`, `NEXT_LAUNCH_STEPS.md`, PDFs | Documentation describes different project generations. | Mark historical documents clearly and maintain one current launch runbook. | Low | Low |
| `style.css` | 31 selectors appear unused in static analysis. | Confirm with coverage across all pages/modes before deletion. | Medium | Medium |
| `published-admin-settings.json` | `pageVisualStates` is empty despite support for page-specific visuals. | Verify whether current intended positioning is stored in product fields or waiting privately; publish only after visual review. | Low | Medium |

## Low

| File(s) | Explanation | Recommended fix | Difficulty | Change risk |
|---|---|---|---|---|
| `CNAME` | File lacks a trailing newline. | Add only during an approved config cleanup; GitHub Pages still reads the domain. | Trivial | Low |
| Image filenames | Spaces, apostrophes, typos, and double extensions complicate tooling. | Preserve existing paths; enforce safer naming only for future files and never bulk-rename existing images. | Low | High |
| HTML source | Several ampersands are not entity-escaped and many buttons omit explicit type. | Correct incrementally with page-level regression checks. | Low | Low |
| Root layout | No conventional `README.md`; architecture docs are under `docs/`. | Add a short setup/status index in a future documentation-only task. | Low | Low |
| PDFs | Workflow PDFs are static snapshots and quickly become stale. | Add a visible “historical” date/version or regenerate only at milestones. | Low | Low |

# Recommended Development Roadmap

## Phase 1 - Protect production data and core entry points

Priority: stability before features.

1. Freeze new feature work.
2. Back up and inventory the live Supabase project.
3. Deploy the reviewed catch-up migration through the canonical manual procedure.
4. Runtime-test every RPC with explicit test records and confirm RLS ownership/Admin restrictions.
5. Remove the insecure direct order fallback after RPC availability is proven.
6. Isolate sign-in/signup initialization from storefront, Test Mode, product, and editor code.
7. Add Admin queue pagination/status counts so unresolved records cannot disappear.
8. Add revision-safe/atomic Admin state persistence before further product editing.
9. Verify every current product/image reference and synchronize draft inventory without changing images.

Exit criteria: authentication is reliable; every Admin write survives refresh; pending commerce records cannot be hidden; secure RPCs are live; no real data was altered during test-mode validation.

## Phase 2 - Make commerce trustworthy

1. Define a server-authoritative product/configuration/price contract.
2. Move structured offer configuration out of free-form message text while preserving legacy rows.
3. Complete guest accepted-offer notification and secure return flow.
4. Persist direct-order payment-submitted and Admin-confirmed states consistently.
5. Add email notifications for new offer, accepted, declined, countered, payment submitted, and order status changes.
6. Add audit-friendly order/offer pagination, history, and reconciliation views.
7. Keep manual payment language explicit; do not add automatic capture until a real processor and webhooks are designed.

Exit criteria: the server owns price/status decisions, every customer has a reliable follow-up channel, and every payment/order transition is durable and auditable.

## Phase 3 - Add regression safety, security, and observability

1. Add automated syntax, JSON, catalog, image-reference, duplicate-slug, and migration lint checks.
2. Add browser smoke tests for login, product selection, cart, offers, account, Admin save, and publishing preview.
3. Add RLS/RPC integration tests against a non-production Supabase project.
4. Add a GitHub Actions workflow that blocks publication on failed checks.
5. Add structured error logging/monitoring for auth, checkout, Admin saves, Edge publishing, and database RPCs.
6. Restrict public `site_edits` access and add browser security headers/CSP in a staged manner.
7. Centralize escaping and remove stored-XSS paths.

Exit criteria: critical workflows are automatically repeatable, production errors are visible, and releases cannot bypass basic integrity/security checks.

## Phase 4 - Improve performance and maintainability

1. Preserve originals but introduce reviewed responsive/lazy web image renditions.
2. Split `script.js` and `admin.js` one tested subsystem at a time.
3. Consolidate product data ownership and retire redundant catalog definitions only after parity tests.
4. Refactor CSS by component after screenshot baselines; reduce duplicate selectors and `!important` use.
5. Add accessibility semantics, keyboard navigation, modal focus management, and screen-reader testing.
6. Paginate member history and move publish history to a dedicated append-only table.
7. Update all operational documentation and mark historical PDFs clearly.

Exit criteria: smaller page payloads, stable mobile behavior, clear module ownership, accessible critical paths, and documentation that matches deployed production behavior.

---

## Audit validation summary

- JavaScript/TypeScript syntax: passed.
- Python syntax: passed using a temporary external pycache location.
- JSON parsing: passed for `product-drafts.json` and `published-admin-settings.json`.
- `git diff --check`: passed before this report was created.
- Static duplicate HTML IDs: none found.
- Missing local HTML/script/style assets: none found.
- Missing referenced image paths: none found.
- Duplicate published slugs: none found.
- Exact image-content duplicate groups: two, reported above; no files changed.
- Credential scan: no private credentials found.
- Live Supabase state, production browser behavior, GitHub permissions, and payment destinations: not tested in this static audit and therefore not claimed as passing.
