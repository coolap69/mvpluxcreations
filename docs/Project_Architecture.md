# MVPLUXCREATIONS Project Architecture

This document describes the repository as it exists on July 18, 2026. It distinguishes code that is present in the repository from database-dependent behavior that still requires deployment and live verification.

# 1. Project Overview

## Purpose

MVPLUXCREATIONS is a production e-commerce website for browsing, configuring, ordering, and making offers on custom and ready-made life-size standees. The site covers sports figures, movie-inspired characters, music artists, public figures, faith and celebration designs, holidays, dinosaurs and animals, fan requests, game/fantasy designs, custom-photo products, and party packs.

The site also includes:

- A size-based pricing calculator.
- Product image and display/background choices.
- Search, category filtering, cart, checkout request, and offer workflows.
- Supabase authentication and member accounts.
- Admin product inventory, inline page editing, commerce management, discount management, and publishing.
- A GitHub-backed publishing path for making approved Admin settings public.

## Technologies used

| Layer | Technology |
|---|---|
| Frontend | Static HTML5, CSS3, and browser JavaScript; no bundler or frontend framework |
| Hosting | Static-site deployment, configured for `mvpluxcreations.com` through `CNAME`; publishing code targets GitHub and is designed for GitHub Pages |
| Backend | Supabase Auth, Postgres, Row Level Security, PostgREST, RPC functions, and one Supabase Edge Function |
| Product data | `product-catalog.js` fallback catalog plus `published-admin-settings.json` published overrides/additions |
| Private Admin state | Supabase `site_edits`, mainly the `admin-global` record and page-specific records |
| Payments | Manual destinations/instructions for Zelle, PayPal, Venmo, and Cash App; no automatic card authorization/capture processor is implemented |
| Repository automation | `sync-products.py` inventories unassigned repository images into `product-drafts.json` |
| Publishing | `admin.js` builds a snapshot; the `publish-admin-changes` Edge Function creates one GitHub commit containing published settings and explicitly selected images |

## Overall architecture

The application is a static multi-page site with shared global scripts rather than a compiled application. Most storefront pages load the same five resources: the Supabase browser library, `supabase-config.js`, `pricing.js`, `product-catalog.js`, and the large `script.js` runtime.

The public product-data path is:

1. `product-catalog.js` defines the default categories and products.
2. `script.js` fetches `published-admin-settings.json` during initialization.
3. Published product records are normalized and merged over defaults per product.
4. Category pages and product-detail views are rendered from the resulting managed catalog.
5. If the published file is unavailable or invalid, the fallback catalog remains usable.

The Admin-data path is separate:

1. Admin changes are stored privately in the `site_edits` table.
2. `admin.js` reads the private Admin state and builds a publish snapshot.
3. The secure Edge Function authenticates the user against `admin_profiles`.
4. The Edge Function validates the snapshot and creates a GitHub commit for `published-admin-settings.json` and any explicitly selected repository images.
5. After deployment, public visitors read the published JSON without needing an Admin session.

Commerce and account features use Supabase tables and RPCs directly. Several of the newest offer, order, discount, and Test Mode contracts are represented in `supabase-schema.sql` and the catch-up migration, but should be considered database-pending until that migration is manually deployed and verified against the live project.

# 2. Folder Structure

Generated metadata such as `.git/`, `.DS_Store`, `supabase/.temp/`, caches, and `node_modules/` is excluded. Image leaf files are summarized by directory because they are binary assets; all image directories are shown.

```text
MVPLUXCREATIONS/
├── AGENTS.md                         Repository safety and change rules
├── CNAME                             Production custom-domain declaration
├── NEXT_LAUNCH_STEPS.md              Operational launch notes
├── SUPABASE_DEPLOYMENT.md            Manual database deployment guide
├── .gitignore
├── index.html                        Homepage and primary storefront
├── account.html                      Signed-in member account
├── admin.html                        Admin dashboard
├── signin.html                       Customer/Admin sign-in
├── signup.html                       Customer registration
├── forgot-password.html              Password-reset request
├── reset-password.html               New-password form
├── standee.html                      Generic product-detail page
├── sports-legends.html               Sports category and specialized showroom
├── movie-inspired.html               Movie category
├── music-artists.html                Music category
├── people-public-figures.html        Public-figure category
├── religious-cutouts.html            Faith and celebration category
├── holiday-cutouts.html              Holiday category
├── dinosaur-cutouts.html             Dinosaur and animal category
├── videogame-cutouts.html            Video game and fantasy category
├── fan-inspired.html                 Fan-request category
├── custom-photo-cutouts.html         Custom-photo category
├── small-cutout-party-packs.html     Party-pack category
├── script.js                         Shared storefront/auth/commerce/admin-editing runtime
├── admin.js                          Admin dashboard runtime
├── member-account.js                 Member account runtime
├── password-reset.js                 Forgot/reset password runtime
├── pricing.js                        Shared height-pricing module
├── product-catalog.js                Default product/category catalog
├── supabase-config.js                Shared Supabase client configuration
├── style.css                         Shared site and Admin stylesheet
├── product-drafts.json               Scanner-generated unpublished image inventory
├── published-admin-settings.json     Publicly deployable Admin snapshot
├── sync-products.py                  Read-only image inventory scanner; writes drafts JSON
├── supabase-schema.sql               Cumulative repository database schema
├── supabase-live-admin-fix.sql        Focused legacy Admin/site-edits SQL
├── images/                            Product and website image assets
│   ├── Business/
│   ├── CustomPhotoStandees/
│   ├── DinosaurAnimalStandees/
│   ├── DinosaurCreatureStandees/
│   ├── FaithCelebrationStandees/
│   │   ├── Jesus/
│   │   ├── Jesus1/
│   │   ├── Jesus2/
│   │   └── Jesus3/
│   ├── FanBackgrounds/
│   ├── FanRequestStandees/
│   │   └── JTTerminator/
│   ├── FrontPageWeb/
│   ├── GameFantasyStandees/
│   │   └── MarioHello/
│   ├── Herobackgroundparts/
│   ├── HolidayStandees/
│   ├── MovieCharacterStandees/
│   │   ├── Elvira/
│   │   ├── Elvira1/
│   │   ├── Endorskeleton/
│   │   ├── Homealone/
│   │   ├── Terminator/
│   │   └── Terminator2/
│   ├── Moviestars/
│   │   ├── Arnold/
│   │   ├── CNorris/
│   │   └── Sydney Sweeney/
│   ├── MusicArtistStandees/
│   │   ├── BBunny/
│   │   ├── JB/
│   │   ├── MichaelJackson/
│   │   │   ├── MJacksonTriller/
│   │   │   │   ├── MJTR/
│   │   │   │   ├── MJTR1/
│   │   │   │   └── MJTR2/
│   │   │   ├── MJbeatit/
│   │   │   └── SmoothCriminal/
│   │   ├── Royce/
│   │   └── TaylorSwift/
│   ├── PartyPackStandees/
│   ├── PeoplePublicFigureStandees/
│   │   └── President/
│   └── SportLegendStandees/
│       ├── ArnoldS/
│       ├── Kobe/
│       │   ├── KobeBackDunk/
│       │   └── KobeyLayout/
│       ├── MJordan/
│       │   ├── MJLAYUP/
│       │   └── MJLAYUP1/
│       ├── Messi/
│       ├── Shaq/
│       └── TomBrady/
├── pdftocreateforchatgpt/
│   ├── MVPLUXCREATIONS_Codex_Workflow_Guide.pdf
│   └── MVPLUXCREATIONS_Next_Steps.pdf
└── supabase/
    ├── functions/
    │   └── publish-admin-changes/
    │       └── index.ts
    └── migrations/
        └── 20260718120000_catch_up_offer_account_order_schema.sql
```

Supporting-data roles:

- `product-drafts.json` currently contains scanner-produced unpublished-image records. It is Admin inventory, not public product data.
- `published-admin-settings.json` contains the last committed public snapshot, including products, category display cards, page visual states, ordering, and publication metadata.
- `SUPABASE_DEPLOYMENT.md` and the catch-up migration are currently deployment-planning artifacts; their presence does not prove that the live database has been migrated.

# 3. Pages

All pages use `style.css`. Storefront pages are reachable from the homepage, category cards, product links, authentication links, or URL/hash navigation.

| Page | Purpose | Main JavaScript | How users reach it |
|---|---|---|---|
| `index.html` | Main landing page: hero, fan-request board, search/filter controls, featured category cards, cart, showcase, informational panels, custom-order/contact sections, and shared commerce modals. | Supabase CDN, `supabase-config.js`, `pricing.js`, `product-catalog.js`, `script.js` | Root URL, Home links, logo, and hash links such as `#shop`, `#custom`, and `#contact` |
| `sports-legends.html` | Sports catalog with a specialized selected-player showroom, image choices, size builder, purchase actions, and an available-player card list. | Shared storefront stack ending in `script.js` | Sports category card/search result; direct links; selected-standee hashes |
| `movie-inspired.html` | Movie-character category grid and generic selected-product/background showroom. | Shared storefront stack | Movie category card/search result |
| `music-artists.html` | Music-artist category grid and generic showroom. | Shared storefront stack | Music category card/search result |
| `people-public-figures.html` | People/public-figure category grid and selected-product display. | Shared storefront stack | People/Public Figures category card/search result |
| `religious-cutouts.html` | Faith and celebration product grid, image choices, and background previews. | Shared storefront stack | Faith & Celebration category card/search result |
| `holiday-cutouts.html` | Holiday product grid and selected-product display. | Shared storefront stack | Holiday category card/search result |
| `dinosaur-cutouts.html` | Dinosaur/animal product grid and background previews. | Shared storefront stack | Dinosaur & Animal category card/search result |
| `videogame-cutouts.html` | Video game/fantasy product grid and background previews. | Shared storefront stack | Game & Fantasy category card/search result |
| `fan-inspired.html` | Fan-request product grid and background previews. | Shared storefront stack | Fan Request category, fan cards, and direct links |
| `custom-photo-cutouts.html` | Custom-photo standee options and background choices. | Shared storefront stack | Custom Photo category card and Custom Orders navigation |
| `small-cutout-party-packs.html` | Smaller standee/party-pack options and backgrounds. | Shared storefront stack | Party Pack category card |
| `standee.html` | Generic query/hash-driven product-detail page with cart and commerce modals. | Shared storefront stack | Links created from managed category products and `standee.html?product=...` style navigation |
| `signin.html` | Shared sign-in page for customer accounts and Admin-capable accounts. | Supabase CDN, `supabase-config.js`, `pricing.js`, `script.js` | Header Sign In links, account redirects, Admin authorization redirects, reset pages |
| `signup.html` | New customer account registration. | Supabase CDN, `supabase-config.js`, `pricing.js`, `script.js` | Header Sign Up links, sign-in page, guest offer prompt |
| `forgot-password.html` | Requests a Supabase password-reset email. | Supabase CDN, `supabase-config.js`, `password-reset.js` | “Forgot password?” on `signin.html` and account password section |
| `reset-password.html` | Accepts the recovery session and lets the user set a new password. | Supabase CDN, `supabase-config.js`, `password-reset.js` | Supabase reset-email redirect |
| `account.html` | Private member dashboard for active/past offers, conversation history, orders, eligible discounts, profile summary, logout, and password recovery. | Supabase CDN, `supabase-config.js`, `member-account.js` | Authenticated Account link/redirects and direct navigation; signed-out visitors are redirected to sign-in |
| `admin.html` | Admin dashboard for commerce queues, Test Mode, drafts, approved/published products, category display cards, pricing, extra images, discounts, import/export, and publication. | Supabase CDN, `supabase-config.js`, `pricing.js`, `product-catalog.js`, `admin.js` | Admin-capable account navigation and inline Admin toolbar “Orders/Admin” action |

The small category HTML files intentionally provide page headings, containers, and a few fallback/background assets. `script.js` supplies most dynamic catalog behavior, so future published products do not require a new hard-coded card in each page.

# 4. JavaScript Files

## `script.js`

- **Size:** approximately 6,279 lines / 264 KB.
- **Purpose:** The shared browser runtime for nearly the entire public site and the inline Admin editor.
- **Pages:** Homepage, every category page, `standee.html`, `signin.html`, and `signup.html`.
- **Dependencies:** Browser DOM APIs; Supabase client from `supabase-config.js`; pricing API from `pricing.js`; fallback catalog from `product-catalog.js`; `published-admin-settings.json`; Supabase tables/RPCs.
- **Major areas/functions:**
  - Cart and checkout: `ensureCartShell`, `addToCart`, `updateCart`, `openCheckout`, `submitCheckoutRequest`, payment-method presentation, negotiated-offer continuation, and discount validation.
  - Offers: `openOffer`, modal rendering, member size/image/background configuration, `submitOfferRequest`, current-offer lookup, and member responses through `respondToSellerCounter`.
  - Authentication: `getSupabaseClient`, `syncSupabaseAuthState`, sign-in/sign-up functions, auth-link updates, logout, and Admin-access checks.
  - Search and filters: `filterProducts`, `getDirectSearchItems`, and `renderSearchResults`.
  - Catalog/publication: published-snapshot validation/loading, per-product normalization, fallback/published merging, category routing, and detail-page rendering.
  - Product experiences: universal size builder, automatic height pricing, finish/background selection, sports showroom, generic category showroom, standee detail page, and purchase jumps.
  - Fan features: request-card navigation, local cooldown state, Supabase vote logging, and gallery voting.
  - Inline Admin: page-specific visual keys, `site_edits` load/save, visual-state normalization, selection, drag/resize/rotate, Undo/Redo, toolbar controls, card hide/reorder/delete relationships, and image-choice controls.
  - Startup: one large `DOMContentLoaded` initializer coordinates auth, product data, page rendering, commerce, and optional inline editing.
- **Assessment:** Functional but unusually large and highly coupled. It combines storefront rendering, auth, commerce, catalog management, and an editor. It should eventually be split into focused modules, but only behind regression tests because load order and globals are central to current behavior.

## `admin.js`

- **Size:** approximately 3,113 lines / 140 KB.
- **Purpose:** Runs the complete Admin dashboard.
- **Pages:** `admin.html` only.
- **Dependencies:** Supabase client, pricing API, fallback catalog, `product-drafts.json`, `published-admin-settings.json`, and the `publish-admin-changes` Edge Function.
- **Major areas/functions:**
  - Access/state: `requireSupabaseAdminAccess`, `loadAdminLiveSettings`, `saveAdminSettingsLive`, and queued-save handling.
  - Test Mode and commerce: Test Mode RPCs, order/offer rendering, status changes, payment confirmation, order-status updates, history loading, and test-record deletion.
  - Product management: fallback/custom product merging, product forms, height pricing, visibility, category assignment/order, archive/restore/delete-record operations, and image uploads/previews.
  - Image relationships: image-choice normalization, add/rename/move/remove, moving an incorrect standalone product into a parent, and duplicate-path protection.
  - Draft inventory: loads `product-drafts.json`; supports new product, image choice, and ignored asset workflows; stores draft workflow state through Admin settings.
  - Publishing: builds/compares snapshots, generates human-readable change summaries, validates explicit image paths, invokes the Edge Function, and displays publish diagnostics/history.
  - Pricing, discounts, import/export, extra-image controls, and lifecycle section rendering.
- **Assessment:** Large and domain-heavy, but more cohesive than `script.js`. Good future split boundaries are commerce, products/drafts, publishing, discounts, and shared Admin persistence.

## `member-account.js`

- **Size:** approximately 257 lines / 12 KB.
- **Purpose:** Loads and renders the signed-in member account.
- **Pages:** `account.html`.
- **Dependencies:** Supabase Auth; `offers`, `offer_messages`, `order_requests`; `get_admin_test_mode`, `list_eligible_discounts`, and `respond_to_member_offer` RPCs.
- **Major functions:** Client access and escaping/formatting helpers; offer-detail parsing; history timeline and offer-card rendering; `loadMemberAccount`; member counteroffer actions; logout.
- **Assessment:** Reasonably focused and readable. Its main risk is reliance on the pending database contract and encoding some configuration details in the legacy `offers.message` text.

## `password-reset.js`

- **Size:** approximately 97 lines / 3.5 KB.
- **Purpose:** Isolated password-recovery request and new-password submission.
- **Pages:** `forgot-password.html`, `reset-password.html`.
- **Dependencies:** Supabase Auth and `supabase-config.js`.
- **Major functions:** Client lookup, status rendering, safe reset redirect URL construction, `resetPasswordForEmail`, and `updateUser` for the new password.
- **Assessment:** Small and clean. Production success also depends on Supabase redirect/site URL configuration.

## `pricing.js`

- **Size:** approximately 70 lines / 2.4 KB.
- **Purpose:** Central height parsing and price interpolation.
- **Pages:** All storefront/category/auth pages that load `script.js`, plus `admin.html`.
- **Dependencies:** None beyond the browser global object.
- **Major functions:** `parseHeight`, `normalizePriceSettings`, and `calculateHeightPrice`; exported as `window.MVPLUX_PRICING` with default price settings.
- **Assessment:** Small, focused, and reusable. This is the cleanest domain module in the repository.

## `product-catalog.js`

- **Size:** approximately 87 lines / 6.8 KB.
- **Purpose:** Defines category-to-page routing and the default/fallback product catalog.
- **Pages:** All product/category pages and `admin.html`.
- **Dependencies:** None; exports browser globals.
- **Major data:** `MVPLUX_PRODUCT_CATEGORIES`, the fallback stage image, a product factory, and `MVPLUX_PRODUCT_CATALOG` records including categories, visibility, original heights, order, and optional image choices.
- **Assessment:** Compact and understandable. It is intentionally a fallback rather than the sole live catalog; published settings can override or add products.

## `supabase-config.js`

- **Size:** approximately 16 lines / 0.6 KB.
- **Purpose:** Holds the public Supabase URL/publishable key and creates one shared browser client.
- **Pages:** Every page that uses authentication, Admin, account, or commerce data.
- **Dependencies:** Supabase JavaScript v2 from the CDN.
- **Major function:** `getMvpluxSupabaseClient`, which returns the existing singleton or initializes it once.
- **Assessment:** Small and appropriate. The publishable browser key is expected to be public; privileged secrets belong only in Edge Function environment variables.

## Non-JavaScript runtime and tooling

- `supabase/functions/publish-admin-changes/index.ts` is a 413-line Deno/TypeScript Edge Function. It authenticates an Admin, validates publication data and image paths, creates Git blobs/tree/commit/ref updates, and records publish history in Supabase.
- `sync-products.py` scans supported image files and source references, excludes verified website-asset directories/paths, preserves existing draft metadata, and rewrites only `product-drafts.json`. It never modifies images or publishes products.

# 5. CSS Structure

## Main stylesheet

`style.css` is the only project stylesheet. It is approximately 6,654 lines / 136 KB and serves every page.

Its major sections include:

- Global body/background/base controls.
- Top navigation and hero layout/animations.
- Homepage sections, product grid, product stage previews, and category-card tuning.
- Information carousel, background modal, cart panel, and commerce modals.
- Fan request board, fan cards, voting, and gallery/showcase layouts.
- Authentication and password-reset pages.
- Category pages, generic and sports showrooms, and standee-detail layouts.
- Size builders, image choices, checkout/payment, offers, and member-account cards.
- Admin dashboard panels, product previews, draft/lifecycle/publish controls, and compact inline Admin overlays/toolbars.

## Components and responsive behavior

The stylesheet contains many component-specific class groups rather than a formal design-system layer. Responsive rules are distributed through the file at breakpoints including roughly 1,000, 860, 850, 820, 760, 720, 650, 620, and 560 pixels. Mobile behavior covers navigation, product grids, modal layouts, showrooms, account sections, and Admin controls.

## Duplication and technical debt

- The file has accumulated multiple “final,” “cleanup,” “polish,” and tuning sections later in the cascade. This indicates additive override-based development.
- Related component rules and mobile overrides are sometimes separated by thousands of lines.
- Shared customer and Admin styles in one file make regressions from selector specificity more likely.
- Several breakpoint blocks repeat similar widths.

A future cleanup should first create visual regression coverage, then split tokens/base layout, storefront components, commerce/auth, member account, Admin dashboard, and inline editor styles. Reordering now without tests would be high risk because the cascade order is functional behavior.

# 6. Database Overview

## Deployment status warning

This section describes what the repository expects, not a verified inventory of the live Supabase project. The catch-up migration and manual deployment guide exist locally, and earlier project work identified missing older and newer RPCs. Offer/order/account/discount/Test Mode features that depend on those objects should remain classified as **Database Pending** until the migration is deployed and runtime-tested.

## Tables and relationships

| Table | Purpose and principal relationships |
|---|---|
| `profiles` | One profile per `auth.users` member; stores screen name, email, and role. Created/updated by an auth-user trigger. |
| `admin_profiles` | Allow-list for Admin access; references `auth.users`. Also stores Admin Test Mode preferences. |
| `categories` | Normalized product categories with slug and sort order. |
| `products` | Relational product catalog with category, descriptive data, original height, base price, and active state. This exists alongside the file-based public catalog. |
| `product_images` | Product image choices/options; belongs to `products` and cascades when a relational product is deleted. |
| `site_edits` | JSON Admin state keyed by page, including `admin-global` and page-specific visual edits. Public published consumers can read permitted state; Admin policies control writes. |
| `offers` | Guest/member offers, negotiation amounts/messages, lifecycle status, payment-preparation data, Test Mode flag, and archive timestamp. Member offers reference `auth.users`. |
| `offer_messages` | Append-style offer conversation and lifecycle history; belongs to an offer and records sender/event/message/amount/timestamp. |
| `order_requests` | Checkout/order records, customer/shipping/items/payment summary, discount audit, lifecycle status, Test Mode, archive data, and optional source offer. |
| `order_events` | Order lifecycle/history events linked to an order. |
| `discount_codes` | Coupon definition, audience, dates, limits, restrictions, stacking behavior, and active state. |
| `discount_redemptions` | Tracks code use by customer/guest and links use to offers/orders for limit enforcement and audit. |
| `fan_votes` | Fan/showcase vote records with member or guest identity and cooldown enforcement. |

Important integrity relationships include:

- `profiles.id` and `admin_profiles.user_id` reference `auth.users.id`.
- `products.category_id` references `categories`; `product_images.product_id` references `products`.
- Member offers/orders reference the authenticated customer where available.
- `offer_messages.offer_id` references `offers`.
- `order_requests.source_offer_id` references `offers` with a partial unique index, preventing more than one order for one accepted offer.
- Discount redemptions relate a code to the applicable customer/guest and offer/order.

## RPC functions

The cumulative schema/catch-up migration define these main public RPC contracts:

- `respond_to_member_offer`: member accepts, declines, or counters an Admin counteroffer while enforcing ownership and allowed status transitions.
- `get_admin_test_mode` / `set_admin_test_mode`: read/update authenticated Admin-only test preferences.
- `submit_test_offer`: creates an explicitly marked test offer for an authenticated Admin running Test Mode.
- `update_test_order_status` / `record_test_order_event`: simulate test order progression without invoking real payment destinations.
- `validate_discount_code`: securely validates code activity, dates, audience, amount, restrictions, limits, and negotiated-offer stacking.
- `submit_order_request`: validates totals/discounts and creates an order request.
- `list_eligible_discounts`: returns discounts visible to the signed-in member.
- `prepare_offer_payment`: stores accepted-offer customer/shipping/item/payment preparation without marking payment complete.
- `submit_offer_payment`: marks customer payment submission as awaiting Admin confirmation.
- `confirm_offer_payment`: Admin-only payment confirmation; marks the offer paid and creates exactly one source-linked order.
- `admin_update_order_status`: Admin-only production/shipping/completion/archive transitions.
- `is_current_user_admin`: shared security helper used by policies and privileged functions.

## Triggers and trigger functions

- `on_auth_user_created_profile` calls `handle_new_user_profile` after an Auth user is created.
- `set_offer_updated_at` keeps offer modification timestamps current.
- `prevent_duplicate_active_member_offer` blocks confusing duplicate active member offers for the same product/configuration.
- `record_new_offer_history` adds the initial offer event.
- `record_offer_update_history` records negotiation/status changes.
- `enforce_fan_vote_two_day_cooldown` limits repeat voting.

## Row Level Security

RLS is enabled throughout the application tables. The intended policy model is:

- Public users can read active categories/products/product images and submit allowed guest commerce/vote records.
- Members can read/update their own profile and read only their own offers, offer history, orders, order events, and redemptions.
- Authenticated offer creation must bind `customer_id` to `auth.uid()`; guest creation requires a null customer ID.
- Admin operations are authorized by membership in `admin_profiles`, not by a browser flag.
- Only explicitly marked test offers/orders can be permanently deleted; real records are retained and archived.
- Discount administration and payment/order status changes are Admin-only.

## Edge Function and publishing security

`publish-admin-changes` is the only repository Edge Function. It:

1. Allows configured production and localhost origins.
2. Validates the bearer session using Supabase Auth.
3. verifies the user exists in `admin_profiles`.
4. Reads Admin publication history from `site_edits`.
5. Validates product collections, slugs, image paths, page visual states, and explicitly supplied image files.
6. Uses server-only `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, and optional `GITHUB_BRANCH` environment values.
7. Creates one GitHub commit and then saves publish metadata/history back to Supabase.

No GitHub credential is stored in frontend JavaScript.

## Authentication

All auth pages use Supabase JavaScript v2 and the singleton in `supabase-config.js`. Supabase manages session persistence and token refresh. `script.js` handles sign-in, registration, sign-out, account navigation, and Admin-profile checks; `password-reset.js` isolates password recovery. Admin authorization always requires the server-side `admin_profiles` record even though local browser state is used for UI preferences such as whether inline tools are displayed.

# 7. Feature Inventory

Status meanings:

- **Complete:** The repository contains a usable end-to-end implementation for the present static-site architecture.
- **Partial:** A meaningful implementation exists, but a workflow, production integration, or verification remains incomplete.
- **Missing:** No real feature implementation exists; static presentation does not count as a backend feature.
- **Database Pending:** Frontend/schema code exists, but required live database deployment/runtime verification is outstanding.

| Feature | Status | Main Files |
|---|---|---|
| Homepage | Complete | `index.html`, `script.js`, `style.css` |
| Products | Complete | `product-catalog.js`, `published-admin-settings.json`, `script.js`, `standee.html` |
| Categories | Complete | Category HTML pages, `product-catalog.js`, `script.js` |
| Search | Complete | `index.html`, `script.js` (`filterProducts`, `renderSearchResults`) |
| Filters | Complete | `index.html`, `script.js` |
| Cart | Complete | `index.html`, `standee.html`, `script.js` |
| Offers | Database Pending | `script.js`, `admin.js`, `member-account.js`, `supabase-schema.sql`, catch-up migration |
| Counteroffers | Database Pending | `script.js`, `admin.js`, `member-account.js`, `supabase-schema.sql`, catch-up migration |
| Checkout | Partial | `script.js`, `index.html`, manual payment destinations, `submit_order_request`/offer-payment RPC contracts |
| Customer Accounts | Database Pending | `account.html`, `member-account.js`, offer/order/history tables and RPCs |
| Login | Complete | `signin.html`, `script.js`, `supabase-config.js` |
| Registration | Complete | `signup.html`, `script.js`, `supabase-config.js`, profile trigger |
| Password Reset | Partial | `forgot-password.html`, `reset-password.html`, `password-reset.js`; requires correct live Supabase redirect configuration |
| Orders | Database Pending | `admin.html`, `admin.js`, `account.html`, `member-account.js`, order RPCs/schema |
| Admin Dashboard | Partial | `admin.html`, `admin.js`, `style.css`, `site_edits`; commerce sections depend on pending DB work |
| Product Publishing | Partial | `admin.js`, `published-admin-settings.json`, Edge Function; architecture exists, but each live deployment still requires successful Edge/GitHub verification |
| Discount Codes | Database Pending | `admin.html`, `admin.js`, `script.js`, `member-account.js`, discount tables/RPCs |
| Test Mode | Database Pending | `admin.html`, `admin.js`, `script.js`, `member-account.js`, Test Mode RPCs/flags |
| Customer Gallery | Partial | Static showcase in `index.html`, voting in `script.js`; no complete customer upload/moderation workflow |
| Reviews | Missing | Static customer-style quotes/content in `index.html`; no review table, submission, moderation, or account workflow |
| Voting | Partial | `index.html`, `script.js`, `fan_votes`, cooldown trigger; local feedback exists, live DB/RLS behavior needs verification |
| Custom Orders | Partial | `index.html`, `custom-photo-cutouts.html`, `script.js`; inquiry/checkout presentation exists but no dedicated production-management workflow |

# 8. Customer Workflow

## Browsing and product selection

1. A visitor lands on `index.html` and can browse featured categories, search by text, or filter categories.
2. Category links open a dedicated category page. `script.js` merges the fallback catalog with published Admin data, filters products by assigned category, and renders visible product cards.
3. Selecting a product opens a category showroom or `standee.html`, depending on the page context.
4. The customer chooses an available image/design/background option and a preset or custom size. Pricing is calculated from height using `pricing.js` and current published/Admin price settings.

## Cart and direct checkout

1. The customer adds the configured item to the browser cart or chooses Buy Now.
2. Checkout collects contact, shipping, and payment-method information.
3. A discount code can be entered; the intended design validates it through a secure RPC rather than trusting the displayed browser calculation.
4. The current payment experience uses manual Zelle, PayPal, Venmo, or Cash App destinations/instructions. It does not implement automatic credit-card authorization or capture.
5. The order request is written through `submit_order_request` when available, with a direct table-insert fallback retained in the frontend for the older schema.
6. Submission records are requests; payment should not be treated as confirmed until the Admin confirms it.

## Offer path

1. A guest sees a compact form based on the current product/default configuration and supplies name, email, amount, and optional comment.
2. A signed-in member uses account identity and can choose the supported size/display configuration without re-entering name or email.
3. The offer is stored as `pending` and appears in Admin.
4. Admin may accept, decline, or, for members, counter.
5. A member can view the offer/history in `account.html`, accept/decline an Admin counter, or send a final counter according to the lifecycle RPC.
6. An accepted offer becomes `accepted_awaiting_payment`; it is not yet an order.
7. The member continues to payment, submits the chosen manual payment step, and sees an awaiting-confirmation state.
8. Admin confirms receipt. The secure RPC marks the offer paid and creates exactly one source-linked order.

This offer/order lifecycle is the intended current architecture but remains database-pending until the catch-up migration is deployed and tested.

## Accounts and recovery

- Registration creates a Supabase Auth user and the auth trigger creates/updates the associated profile.
- Sign-in restores the Supabase session across pages and changes the header to member/account actions.
- `account.html` queries only the signed-in member’s permitted offers, history, orders, and eligible discounts under RLS.
- Password recovery sends a Supabase email that returns to `reset-password.html`, where the recovery session can update the password.

# 9. Admin Workflow

## Access and private state

1. An Admin signs in through the normal Supabase auth page.
2. `admin.html` verifies the authenticated user against `admin_profiles`.
3. Product, draft, display-card, price, extra-image, and page-edit state is loaded from `site_edits`; browser storage is used only for transient compatibility/UI preferences, not public publication.

## Product and image inventory

1. After new repository images are added, an operator manually runs `sync-products.py`.
2. The scanner identifies supported files already referenced by source/catalog data, excludes verified website assets, and writes remaining unassigned images to `product-drafts.json`.
3. Admin loads those drafts under “New Images Waiting for Setup.”
4. Each draft can become a new product, an image choice attached to an existing product, or ignored non-product inventory. None of these actions deletes the physical image.
5. Approved products are edited separately from category display cards. Admin can manage categories, visibility, order, height, images, backgrounds, and image choices.

## Inline page editing

1. An authorized Admin enables editing from `admin.html` or a storefront page.
2. The floating toolbar selects the actual image occurrence and edits a page-specific visual-state key rather than the image path alone.
3. Move, scale, rotate, center/reset, lock, card visibility/order, and Undo/Redo update the private page state in `site_edits`.
4. Turning tools off while signed in can retain the private preview; logged-out customers continue to see only published settings.

## Publishing products and page visuals

1. Admin reviews “Approved — Waiting to Publish,” “Published Products,” diagnostics, and the generated change summary.
2. “Publish One GitHub Commit” builds a full generic snapshot from persisted Admin state.
3. The browser sends the snapshot, commit description, and only explicitly selected new image files to the Edge Function.
4. The Edge Function authenticates the Admin, validates the payload, creates one GitHub commit, and records the publish result.
5. Once the static deployment updates, public pages fetch the new `published-admin-settings.json`.

## Offers, payments, and orders

1. Admin reviews offers by lifecycle queue: Pending, Counteroffers, Accepted/Awaiting Payment, Completed/Paid, Declined, and Archived.
2. Accept/decline/counter actions persist the offer status rather than deleting the record.
3. After a customer submits payment, Admin uses “Mark Payment Confirmed.” The database RPC creates no more than one related order.
4. Orders progress through New, In Production, Shipped, Completed, and Archived.
5. Real records are retained and archived; only explicitly marked test records are eligible for permanent deletion.
6. Admin Test Mode is designed to simulate the workflow without opening real payment destinations or mixing test records into real totals.

The commerce workflow in this section depends on the live database having the current RPCs, policies, triggers, and columns.

# 10. Current Project Status

## Finished or substantially working

- Static production storefront, responsive category pages, and shared navigation.
- Default catalog plus published JSON override/fallback model.
- Dynamic category routing and generic product rendering without per-product code changes.
- Height-based pricing and size selection.
- Product image/background choices and one-image products.
- Search, category filtering, cart, and manual-payment presentation.
- Supabase sign-in/registration architecture and shared-client configuration.
- Admin product/draft/image-choice management and private `site_edits` persistence architecture.
- Page-specific inline Admin image positioning with Undo/Redo and public snapshot support.
- Secure GitHub publishing design through a Supabase Edge Function.
- A public published snapshot exists and includes approved custom products in addition to fallback products.

## Partially complete

- Checkout works as a request/manual-payment experience, not an automatic payment processor workflow.
- Product publishing is implemented, but operational success depends on the deployed Edge Function, secrets, GitHub permissions, and Pages deployment.
- Password reset is implemented in code but requires live redirect allow-list verification.
- Customer gallery and voting are presented, but a full customer-submission/moderation system is absent.
- The Admin dashboard is broad, but commerce portions rely on the pending database deployment.
- Custom orders reuse the normal product/checkout experience rather than a specialized production pipeline.

## Blocked or pending on the database

- Complete member offer conversation/history.
- Persistent counteroffer status transitions.
- Accepted-offer payment preparation and submission.
- Admin payment confirmation and idempotent order creation.
- Offer/order archiving and test-only permanent deletion protections.
- Admin Test Mode RPC behavior.
- Secure discount validation, usage limits, and member discount listing.
- Full member-account offer/order data loading.

The repository contains `supabase/migrations/20260718120000_catch_up_offer_account_order_schema.sql` and a manual deployment guide. These are not evidence of live deployment; the live project must be backed up, migrated, and runtime-tested before the features are marked complete.

## Known technical debt

- `script.js` is a 6,000-plus-line global runtime with many unrelated responsibilities and a single large initialization sequence.
- `admin.js` is also large and combines persistence, commerce, products, drafts, discounts, and publishing.
- `style.css` is a long append-only cascade with late overrides and scattered responsive sections.
- The code relies heavily on global functions, inline HTML event attributes, global state, and script load order.
- There is no package/build system or automated browser/unit-test suite in the repository.
- Product information exists in three conceptual places: fallback JavaScript, published JSON, and private `site_edits`. The merge/publish contract must remain disciplined.
- Relational `products`/`product_images` tables coexist with the file-based storefront catalog; their ownership and future role should be clarified before another catalog migration.
- Some legacy commerce details are serialized into offer message text in addition to structured history.
- Several frontend paths retain compatibility fallbacks for older database schemas, which increases behavior variation.

## Biggest strengths

- The site is deployable as simple static assets with minimal infrastructure.
- Public product data has a resilient fallback when the published settings file fails.
- Product/category/image-choice behavior is data-driven enough to add future products without editing every page.
- Privileged GitHub credentials remain server-side.
- RLS and RPC designs explicitly separate members, guests, Admins, real records, and test records.
- Image inventory and publication workflows are designed to preserve physical repository assets.
- The shared pricing module provides one authoritative height-pricing calculation.

## Biggest risks

- High regression risk from the size and coupling of `script.js` and `style.css`.
- Live database drift: repository frontend code can call RPCs that are not yet deployed.
- A static site has no server application layer beyond Supabase; secure commerce behavior must therefore remain inside carefully audited RLS/RPC/Edge Function code.
- Manual payments cannot provide automatic authorization/capture, settlement verification, refunds, or charge-state webhooks.
- Operational publishing depends on several external systems succeeding in order: Supabase Auth, Admin authorization, Edge Function configuration, GitHub API permissions, and static deployment.
- Limited automated testing means browser, auth, publishing, and database lifecycle regressions can escape source-level checks.

## Recommended engineering orientation

Before changing behavior, an engineer should read, in order:

1. `AGENTS.md` for production safety rules.
2. This architecture document.
3. `product-catalog.js`, `pricing.js`, and `supabase-config.js` for the small shared contracts.
4. The relevant HTML page and only the corresponding region of `script.js` or `admin.js`.
5. `supabase-schema.sql` and the catch-up migration before changing any commerce/account call.
6. `published-admin-settings.json` and the Edge Function before changing publication behavior.

Any database-dependent change should first compare the live database inventory with the repository schema. Any visual or interaction change should be verified in the real browser across the homepage, a generic category page, the sports showroom, and the relevant authenticated page before deployment.
