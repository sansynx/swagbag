<p align="center">
  <img src="public/mark.svg" alt="SwagBag" width="72" height="72" />
</p>

<h1 align="center">SwagBag</h1>

<p align="center">Give the choice. Keep the joy.</p>

<p align="center">
  <a href="https://swagbag.pages.dev/">Live demo</a> ·
  <a href="https://paypalaihackathon.devpost.com/">PayPal AI Hackathon</a>
</p>

![SwagBag landing page](assets/landing-hero.png)

Companies mean well when they give out T-shirts, bottles, and stickers. People often have enough of those already. We built SwagBag so a celebration budget can become something each employee actually wants.

- **HR** creates a moment for everyone, one person, or a selected group, sets the budget, and can share an existing voucher code privately
- **Employees** get notified, ask AI for suggestions from approved rewards, and choose for themselves; their preference stays private
- **Finance** sees commitments, payment records, exports, and an audit trail, with a PayPal sandbox checkout flow for funded moments

<details>
<summary>How the app works</summary>

HR invites people, manages groups, and creates moments. An eligible employee selects a reward. Cloudflare Workers AI suggests options from a fixed catalog based on the employee's private preference. Finance can then approve a PayPal sandbox order for the selected rewards. The app records the capture when PayPal credentials are configured. Without credentials, finance can walk through a labeled simulation that makes no PayPal request or ledger entry. Voucher codes are supplied by HR and delivered in the app; SwagBag does not buy or email vouchers.

</details>

<details>
<summary>Run locally</summary>

Use Node.js 24 or later, pnpm, and a Cloudflare account for the Workers AI binding.

1. Run `pnpm install` and `pnpm exec wrangler login`.
2. Create a D1 database with `pnpm exec wrangler d1 create swagbag`. Put its name and ID in `wrangler.jsonc` under `d1_databases`.
3. Create an ignored `.dev.vars` file in the project root:

   ```text
   JWT_SECRET=<random string of at least 32 characters>
   COUPON_KEY=<base64-encoded 32-byte random key>
   BOOTSTRAP_SECRET=<random string>
   PAYPAL_CLIENT_ID=<PayPal sandbox client ID>
   PAYPAL_CLIENT_SECRET=<PayPal sandbox client secret>
   ```

   `openssl rand -base64 48` can generate `JWT_SECRET` and `BOOTSTRAP_SECRET`; `openssl rand -base64 32` generates `COUPON_KEY`. Keep these values out of Git.

4. Run `pnpm exec wrangler d1 migrations apply swagbag --local`, `pnpm run build`, and `pnpm exec wrangler pages dev dist --port 8788`.
5. Create the first finance account once with `POST http://localhost:8788/api/bootstrap`. Send JSON fields `name`, `email`, and a password of at least 12 characters, plus an `x-bootstrap-secret` header matching `.dev.vars`. Sign in and invite HR and employee accounts from **People**. Copy and share invitation links manually.

The PayPal sandbox credentials are needed for checkout. For judging, put demo account credentials in Devpost's testing instructions, never in the repository.

</details>

## Built with

- React 19, TypeScript, and Vite 8 for a small web client; Cloudflare Pages and Pages Functions for hosting and the API
- Cloudflare D1 for records and Workers AI for private reward suggestions
- PayPal Orders API in sandbox mode for approval and capture, plus ECharts for finance charts
- Codex assisted with design and development

SwagBag uses React and Vite rather than Next.js. This kept the client and Cloudflare Functions setup small for the hackathon.

## License

[MIT](LICENSE). SwagBag is an independent PayPal AI Hackathon project. PayPal trademarks remain PayPal's property.
