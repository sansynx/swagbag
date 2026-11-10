# SwagBag

SwagBag gives employees a choice when a company celebrates an occasion. HR sets a per-person budget and chooses everyone, a group, or one employee. Employees can describe what would be useful, get suggestions from Cloudflare Workers AI, and select a reward. Finance sees commitments, PayPal sandbox payments, and an audit trail. HR can also deliver a pre-funded voucher code privately to an eligible employee in the app.

Hosted demo: https://swagbag.pages.dev/

## Run locally

Use Node.js 24 or later, pnpm, and a Cloudflare account for the Workers AI binding.

1. Run `pnpm install` and `pnpm exec wrangler login`.
2. Create a D1 database with `pnpm exec wrangler d1 create swagbag`. Put its database name and ID in `wrangler.jsonc` under `d1_databases`.
3. Create an ignored `.dev.vars` file in the project root:

   ```text
   JWT_SECRET=<random string of at least 32 characters>
   COUPON_KEY=<base64-encoded 32-byte random key>
   BOOTSTRAP_SECRET=<random string>
   PAYPAL_CLIENT_ID=<PayPal sandbox client ID>
   PAYPAL_CLIENT_SECRET=<PayPal sandbox client secret>
   ```

   `openssl rand -base64 48` can generate `JWT_SECRET` and `BOOTSTRAP_SECRET`; `openssl rand -base64 32` generates `COUPON_KEY`. Keep these values out of Git.

4. Run `pnpm exec wrangler d1 migrations apply swagbag --local`, then `pnpm run build` and `pnpm exec wrangler pages dev dist --port 8788`.
5. Create the first finance account once by sending `POST http://localhost:8788/api/bootstrap` with JSON fields `name`, `email`, and a password of at least 12 characters, plus an `x-bootstrap-secret` header matching `.dev.vars`. Sign in and invite HR and employee accounts from **People**. The invitation link is copied and shared manually.

The PayPal sandbox credentials are needed to exercise checkout. Employee reward suggestions use the Workers AI binding. Voucher codes are manually supplied by HR and delivered inside SwagBag; the app does not purchase or email vouchers.

## Architecture

React and Vite render the site on Cloudflare Pages. Pages Functions handle role checks, JWT cookie sessions, campaigns, recipient groups, audit records, and the PayPal sandbox Orders API. D1 stores application data. Workers AI ranks choices from a fixed reward catalog; an employee's private preference is not shown to HR.

For hackathon judging, provide finance, HR, and employee demo credentials in the Devpost testing instructions. Never publish secrets or privileged bootstrap credentials in this repository.

SwagBag is an independent project built for the PayPal AI Hackathon. PayPal trademarks remain PayPal's property.
