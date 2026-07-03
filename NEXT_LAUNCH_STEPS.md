# MVPLUXCREATIONS Launch Handoff

Last updated: 2026-07-03

## Current Status

- Frontend exists already. This is the website in this folder, hosted by GitHub Pages.
- Supabase is connected in `supabase-config.js`.
- Current Supabase project URL: `https://ncbddqxdinvcsoszdsxr.supabase.co`
- Signup confirmation redirect in code points to `https://mvpluxcreations.com/signin.html`.
- Sign up/sign in worked after the new Supabase project was created.
- Checkout/order requests save to Supabase.
- Make-offer requests save to Supabase.
- Daily voting was added:
  - Guests can vote once per browser per day.
  - Signed-in users can be logged once per account per day after the `fan_votes` SQL is run.
- Browser `alert()` popups were removed from the site code.
- Payment buttons exist:
  - Zelle is first and marked preferred/no processing fee.
  - PayPal opens `https://paypal.me/louispazos`.
  - Venmo opens `https://venmo.com/u/Lap27`.
  - Cash App opens `https://cash.app/$Watawonderfulworld`.
- `supabase-test.html` is only a test page and should not be added to GitHub unless intentionally making it public.

## Before Launch

1. Run the latest SQL in Supabase.
   - Open `supabase-schema.sql`.
   - Run the full schema or at least the new `fan_votes` section.
   - Add the admin user to `admin_profiles` so the admin dashboard can see orders/offers.

2. Test payment options in checkout.
   - Zelle should show phone number `(508) 463-5910` and copy button.
   - PayPal, Venmo, and Cash App should open in secure new tabs.
   - Customer should see the instruction to include the order number in the payment note.
   - Optional later: add QR images under `images/payment/`.

3. Test these flows on the live GitHub Pages site:
   - Sign up.
   - Sign in.
   - Add to cart.
   - Checkout/order request.
   - Make offer accepted flow.
   - Make offer review flow.
   - Vote once, then try voting again.
   - Admin page loads orders/offers.

4. Connect the domain.
   - `CNAME` file has been added with `mvpluxcreations.com`.
   - In GitHub Pages settings, set custom domain to `mvpluxcreations.com`.
   - In Porkbun DNS, point the domain to GitHub Pages.
   - Wait for HTTPS to become ready.
   - In Supabase Auth URL Configuration, add `https://mvpluxcreations.com/**` and `https://www.mvpluxcreations.com/**`.

## Domain Notes

- Domain: `mvpluxcreations.com`
- Email forwarding is separate from Supabase.
- If Porkbun forwarding was set up, test:
  - `orders@mvpluxcreations.com`
  - `support@mvpluxcreations.com`
- Both should forward to the business Gmail.

## What To Tell The Next Codex

Use this prompt:

```text
Work in /Users/louispazos/MVPLUXCREATIONS.
Read NEXT_LAUNCH_STEPS.md first.
Do not redesign anything unless I clearly ask.
Do not add supabase-test.html to GitHub.
Help me finish launch: payment links, admin dashboard, Supabase SQL, domain CNAME, and final testing.
Make small changes only and tell me exactly what changed.
```

## Git Safety

Before ending a work session:

```bash
cd /Users/louispazos/MVPLUXCREATIONS
git status
```

If only wanted website files changed:

```bash
git add admin.html admin.js clear-site-data.html custom-photo-cutouts.html dinosaur-cutouts.html fan-inspired.html index.html movie-inspired.html music-artists.html religious-cutouts.html script.js signin.html signup.html small-cutout-party-packs.html sports-legends.html standee.html style.css supabase-config.js supabase-schema.sql videogame-cutouts.html NEXT_LAUNCH_STEPS.md
git commit -m "Save launch progress"
git push origin main
```

Do not run `git add .` unless you are sure every file should go public.
