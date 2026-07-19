# Supabase offer/account/order catch-up plan

This guide covers the database objects expected by the current repository and the safe catch-up migration for commits `0a3ca79` and `a72509b`. It does not deploy anything by itself.

## Repository database inventory

### Core catalog and account objects

| Object | Definition | Website dependency | Generation |
| --- | --- | --- | --- |
| `profiles` | `id uuid` PK/FK `auth.users`; `screen_name text`; `email text`; `role text default 'customer'`; `created_at timestamptz default now()` | Auth profile creation in `supabase-schema.sql`; account identity otherwise primarily uses the Auth user | Older base schema |
| `categories` | `id uuid`; unique `slug`; `name`; `description`; `sort_order default 0`; `created_at` | Catalog backend definition; storefront currently also has file-based catalog data | Older base schema |
| `products` | `id uuid`; `category_id` FK; unique `slug`; `name`; `description`; `original_height_inches`; `base_price default 129.99`; `is_active default true`; `created_at` | Catalog backend definition | Older base schema |
| `product_images` | `id uuid`; `product_id` FK; `label default 'No Background'`; `image_url`; `is_default default false`; `sort_order default 0`; `created_at` | Catalog backend definition | Older base schema |
| `admin_profiles` | `user_id uuid` PK/FK Auth; `created_at`; `test_mode_enabled default false`; `test_customer_type default 'guest'` | `admin.js` Admin authorization/Test Mode; `script.js` and `member-account.js` Test Mode | Base table older; Test Mode columns pre-a725 |
| `site_edits` | `page_key text` PK; `edits jsonb default {}`; `revision bigint default 0`; `updated_by uuid` FK; `updated_at` | Private Admin/inline visual state with optimistic concurrency protection | Older Admin editing plus launch hardening |
| `fan_votes` | `id uuid` PK; `vote_id text`; `vote_date date default current_date`; `customer_id uuid` FK Auth; `guest_id text`; `created_at`; CHECK requiring a customer or guest identifier | `script.js` fan voting | Older unrelated feature; excluded from catch-up migration |

### Offer and order objects

| Object | Required columns and constraints | Website dependency | Generation |
| --- | --- | --- | --- |
| `offers` | UUID PK; product/customer identity; amount/message; `status default 'pending'`; seller and buyer counter fields; timestamps; `is_test default false`; payment method/address/phone/items/notes/submitted timestamp; `archived_at` | Offer submission/loading in `script.js`; queues/actions in `admin.js`; account history/actions in `member-account.js` | Base offer table; history/Test Mode pre-a725; payment/archive fields a725 |
| `offer_messages` | UUID PK; `offer_id` FK cascade; sender user/type; message/event type; amount/message; timestamp; `is_test` | Offer timelines in `admin.js` and `member-account.js` | Pre-a725 |
| `order_requests` | UUID PK; customer/contact/address/items/payment/totals/status/notes/timestamp; original/discount/test fields; `updated_at`; `archived_at`; `source_offer_id` FK `offers` with `ON DELETE RESTRICT` | Checkout in `script.js`; Admin queues in `admin.js`; customer Orders in `member-account.js` | Base order table; secure order/Test Mode pre-a725; archive/source offer a725 |
| `order_events` | UUID PK; `order_request_id` FK cascade; event type; actor user FK; `is_test`; timestamp | Secure order/Test Mode/order status history | Pre-a725 |
| `discount_codes` | Code metadata, type/value constraints, activation dates, limits, audience, restrictions, stacking flag, creator and timestamps | Checkout validation, Admin code management, account eligible discounts | Pre-a725 dependency of secure order RPC |
| `discount_redemptions` | Code/customer/order/offer FKs; original/discount/final amounts; `is_test`; timestamp | Server-side usage limits and audit | Pre-a725 dependency of secure order RPC |

Indexes expected: `offer_messages_offer_created_idx`; partial unique `order_requests_source_offer_unique`; `discount_codes_upper_code_unique`; and the three discount redemption lookup indexes. Foreign keys use `SET NULL`, `CASCADE`, or `RESTRICT` exactly as declared in the migration. No storage bucket or storage policy is referenced by the current JavaScript or SQL.

## Trigger and function inventory

| Function / trigger | Signature or event | Dependencies | Called by |
| --- | --- | --- | --- |
| `handle_new_user_profile` / `on_auth_user_created_profile` | Auth user `AFTER INSERT` trigger | `profiles`, `auth.users` | Supabase Auth |
| `set_offer_updated_at` / same-named trigger | Offer `BEFORE UPDATE` | `offers.updated_at` | Any offer update |
| `prevent_duplicate_active_member_offer` / same-named trigger | Offer `BEFORE INSERT` | Offer product/customer/message/status fields | Member offer insert in `script.js` |
| `record_new_offer_history` / same-named trigger | Offer `AFTER INSERT` | `offers`, `offer_messages` | All offer insert paths |
| `record_offer_update_history` / same-named trigger | Offer `AFTER UPDATE` | Offer lifecycle fields, `offer_messages`, `admin_profiles` | Admin/member/payment transitions |
| `enforce_fan_vote_two_day_cooldown` / same-named trigger | Fan vote `BEFORE INSERT` | `fan_votes` | Fan voting; unrelated to catch-up |

### RPC signatures and dependencies

| RPC signature | Required objects/statuses | Frontend caller | Missing-dependency failure |
| --- | --- | --- | --- |
| `respond_to_member_offer(uuid,text,numeric,text)` | Role-aware offer transitions; Admin identity from `admin_profiles`; member ownership; `pending`, `countered`, `buyer_countered`, `accepted_awaiting_payment`, `declined`, `archived`; history triggers | `admin.js`, `script.js`, `member-account.js` | Admin/member offer decisions fail; direct offer UPDATE is intentionally unavailable |
| `delete_test_offer(uuid)` | Admin identity; `offers.is_test`; linked orders must also be test data | `admin.js` | One test offer cannot be safely removed |
| `delete_all_test_offers()` | Admin identity; deletes only test offers and linked test orders; rejects any linked real order | `admin.js` | Bulk test-offer cleanup is unavailable |
| `save_site_edits(text,jsonb,bigint,boolean)` | `site_edits.revision`; authenticated Admin; merge or replace mode | `admin.js`, `script.js`, publishing Edge Function | Admin saves can conflict or overwrite newer state if this RPC is missing |
| `submit_test_offer(text,text,text,numeric,text)` | `admin_profiles` Test Mode fields; `offers.is_test`; insert/history triggers | `script.js` | Admin Test Mode offer submission fails |
| `prepare_offer_payment(uuid,text,text,text,jsonb,jsonb,text,text)` | Offer payment columns; accepted statuses; admin helper; authenticated owner or Admin test record | `script.js` checkout | Accepted offer cannot store checkout/payment preparation |
| `submit_offer_payment(uuid)` | Prepared payment fields; `payment_submitted` status | `script.js` | Customer payment-submission state cannot persist |
| `confirm_offer_payment(uuid)` | Payment fields; `order_requests.source_offer_id`; unique partial index; `order_events`; Admin helper; `paid`/`new` statuses | `admin.js` | Payment cannot be confirmed and order cannot be created idempotently |
| `admin_update_order_status(uuid,text)` | Order timestamps/archive fields; order events; statuses `new`, `in_production`, `shipped`, `completed`, `archived` | `admin.js` | Order queue changes do not persist securely |
| `get_admin_test_mode()` | Admin Test Mode columns | All three commerce scripts | Test Mode cannot load |
| `set_admin_test_mode(boolean,text)` | Admin row and Test Mode columns | `admin.js` | Test Mode cannot be saved |
| `validate_discount_code(text,numeric,text,text[],text[],boolean)` | Discount tables/fields and Auth context | `script.js` | Secure code validation unavailable |
| `submit_order_request(text,text,text,jsonb,jsonb,text,numeric,text,text,boolean,boolean)` | Orders, discounts, redemptions, events, Admin Test Mode, published server price settings, item height metadata | `script.js` | Secure order/Test Mode submission is unavailable; there is no direct-insert fallback |
| `update_test_order_status(uuid,text)` | Test order and events | `script.js` | Test payment simulation cannot persist |
| `record_test_order_event(uuid,text)` | Test order and events | `script.js` | Test payment-navigation events cannot persist |
| `list_eligible_discounts()` | Discount tables and Auth | `member-account.js` | Account shows migration-required message |

The publishing Edge Function uses its own environment-provided Supabase client to validate the calling user and reads `admin_profiles`; it does not add database objects. Password-reset code uses Supabase Auth APIs only. No application storage bucket is referenced.

## RLS and grants expected

| Table | Policy names and operations |
| --- | --- |
| `profiles` | `Profiles can read their own profile` (SELECT own row); `Profiles can update their own profile` (UPDATE own row) |
| `categories` | `Anyone can view categories` (SELECT) |
| `products` | `Anyone can view active products` (SELECT active rows) |
| `product_images` | `Anyone can view product images` (SELECT) |
| `admin_profiles` | `Admins can view their admin profile` (SELECT own Admin row) |
| `site_edits` | `Admins can view site edits` (SELECT); `Admins can create site edits` (INSERT); `Admins can update site edits` (UPDATE); `Admins can delete site edits` (DELETE). Anonymous SELECT is revoked. |
| `fan_votes` | `Anyone can create fan votes` (INSERT with voter/date checks); `Admins can view all fan votes` (SELECT) |
| `offers` | Guest/member INSERT policies and customer/Admin SELECT policies. UPDATE and DELETE are revoked from browser roles; secured RPCs enforce all transitions and test-only deletion. |
| `offer_messages` | `Members can view their own offer history`; `Admins can view all offer history` |
| `order_requests` | Customer/Admin SELECT; Admin UPDATE; permissive and restrictive test-only DELETE policies; no direct INSERT policy after catch-up |
| `discount_codes` | `Admins manage discount codes` (ALL, Admin only) |
| `discount_redemptions` | Member-own and Admin-all SELECT policies |
| `order_events` | Member-own and Admin-all SELECT policies |

Admins are identified by `admin_profiles.user_id = auth.uid()`. Guests may insert only non-test guest offers. Normal order insertion uses the security-definer `submit_order_request` RPC; direct anonymous/authenticated order inserts are revoked. Direct offer UPDATE and DELETE are also revoked. Offer transitions use `respond_to_member_offer`; permanent test cleanup uses Admin-only deletion RPCs. Real offers cannot be deleted by either RPC. Security-definer RPCs are revoked from `public` and granted only to required roles.

Expected grants are: schema usage for `anon`/`authenticated`; offer INSERT for both roles; authenticated SELECT/UPDATE on commerce records; authenticated DELETE subject to restrictive RLS; authenticated Admin-managed discount table access subject to RLS; authenticated EXECUTE on the non-sensitive Admin-check helper used by RLS; and explicit EXECUTE grants matching the RPC table above. Offer trigger functions are revoked from direct public execution. The Auth profile trigger and fan-vote trigger functions are not client-executable.

## Migration strategy

Use the single cumulative migration:

`supabase/migrations/20260718120000_catch_up_offer_account_order_schema.sql`

One atomic migration is safer than applying the latest delta alone because the a725 RPCs depend directly on the pre-a725 tables, columns, helper functions, triggers, policies, and grants. The file is ordered as:

1. Create missing prerequisite tables and add missing columns.
2. Stop and roll back if an existing status constraint appears incompatible.
3. Add indexes and duplicate-order protection.
4. Enable RLS and add guarded policies.
5. Install offer lifecycle triggers and idempotently backfill missing initial history events.
6. Install older member/order/Test Mode RPCs.
7. Install a725 payment/archive RPCs.
8. Apply least-privilege grants.

It contains no table/column drops, truncation, sequence reset, destructive update, or record replacement. When an `updated_at` column is missing or contains nulls, the migration initializes only those null values from the row's existing `created_at`; it does not replace a populated timestamp. Named commerce policies and offer triggers are replaced transactionally so a partially deployed older definition cannot survive under the expected name; replacing these definitions does not delete table data. Rerunning it is designed to be safe.

## Manual SQL Editor deployment

Do not deploy until the migration has been reviewed and a backup exists.

1. Sign in at `https://supabase.com/dashboard` and open the project whose URL is `https://ncbddqxdinvcsoszdsxr.supabase.co`. Confirm the project reference before running SQL.
2. Create a backup first. In the project, open **Database → Backups** and confirm a recent successful backup. If the plan does not provide downloadable backups, export the affected schemas/tables using the dashboard-supported export procedure before continuing. At minimum preserve `offers`, `offer_messages`, `order_requests`, `order_events`, `admin_profiles`, `discount_codes`, and `discount_redemptions`. Record pre-deployment row counts and status counts for `offers` and `order_requests` so they can be compared afterward.

```sql
select 'offers' as object_name,count(*) as row_count from public.offers
union all select 'order_requests',count(*) from public.order_requests;

select 'offers' as object_name,status,count(*) from public.offers group by status
union all select 'order_requests',status,count(*) from public.order_requests group by status
order by object_name,status;

select to_regclass('public.offer_messages') as offer_messages,
       to_regclass('public.order_events') as order_events,
       to_regclass('public.discount_codes') as discount_codes,
       to_regclass('public.discount_redemptions') as discount_redemptions;
```
3. Open **SQL Editor** and create a new query. Do not paste service-role keys, passwords, access tokens, or connection strings.
4. Open `supabase/migrations/20260718120000_catch_up_offer_account_order_schema.sql` locally, copy its entire contents, and paste it into the SQL Editor. Do not edit the SQL only in the dashboard. If a correction is required, update the repository migration first and restart review using the matching file.
   Do not run the older monolithic `supabase-schema.sql` as a substitute or immediately after this migration; it is a repository reference, not this reviewed catch-up transaction.
5. Review that the query begins with `begin;` and ends with `commit;`, then click **Run** once.
6. Success should report completion with no error and no result rows required. Notices that an object already exists are acceptable where `IF NOT EXISTS` is used.
7. Stop immediately if you see an incompatible status-constraint exception, missing-column/type error, permission error, function-signature error, foreign-key error, or unique-index failure. Because the entire file is one transaction, an error before `commit` should roll back every change. Do not run only the statements after the error and do not remove constraints or delete data to force it through. Correct the repository migration, review it again, and rerun the entire file.
8. In a new SQL Editor query, verify RPC signatures without invoking them:

```sql
select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'respond_to_member_offer','delete_test_offer','delete_all_test_offers',
    'save_site_edits','get_admin_test_mode','set_admin_test_mode',
    'submit_test_offer','update_test_order_status','record_test_order_event',
    'validate_discount_code','submit_order_request','list_eligible_discounts',
    'prepare_offer_payment','submit_offer_payment','confirm_offer_payment',
    'admin_update_order_status'
  )
order by p.proname;
```

9. Verify protection and the unique source-offer index:

```sql
select schemaname, tablename, policyname, cmd, permissive
from pg_policies
where schemaname='public' and tablename in ('offers','order_requests')
order by tablename, policyname;

select role_name,
  has_table_privilege(role_name,'public.offers','UPDATE') as can_update_offers,
  has_table_privilege(role_name,'public.offers','DELETE') as can_delete_offers
from (values ('anon'),('authenticated')) as roles(role_name);

select indexname, indexdef
from pg_indexes
where schemaname='public' and indexname='order_requests_source_offer_unique';

select event_object_table,trigger_name,event_manipulation,action_timing
from information_schema.triggers
where trigger_schema='public' and event_object_table='offers'
order by trigger_name;

select table_name,column_name,data_type,column_default,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('offers','offer_messages','order_requests','order_events','admin_profiles')
order by table_name,ordinal_position;
```

10. Compare post-deployment row counts and status counts with the pre-deployment values. Existing `offers` and `order_requests` counts and statuses must be unchanged. `offer_messages` may increase only by missing `customer_offer` or `customer_comment` history rows. Confirm populated customer names, emails, amounts, messages, statuses, `created_at`, and any pre-existing `updated_at` values remain unchanged.
11. Do not perform a destructive rollback. If the migration errors, stop; the transaction should have rolled back. If it succeeds but runtime behavior is unexpected, preserve the backup and investigate before running any corrective SQL.

After deployment, runtime validation must use explicit test records and restore/delete only those marked `is_test = true`. Do not use real customer records for migration testing. In the browser, verify member offer submission and refresh persistence, Admin accept/decline/counter queues, accepted-offer payment preparation/submission, Admin payment confirmation, exactly-one-order behavior on repeated confirmation, order archive persistence, member offer history, and Admin Test Mode isolation. Confirm normal logged-out storefront and sign-in still load. Do not open a real payment destination while testing.
