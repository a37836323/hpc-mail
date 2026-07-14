<p align="center">
  <img src="doc/demo/logo.png" width="88" alt="HPC Mail logo">
</p>

<h1 align="center">HPC Mail</h1>

<p align="center">
  A modern multi-domain email workspace built on Cloudflare Workers
</p>

<p align="center">
  <a href="README.md">简体中文</a> · English
</p>

HPC Mail combines Cloudflare Email Routing, Workers, D1, KV, and R2 into a self-hosted email workspace. Platform accounts sign in with a username and password, independently from the email addresses they manage. Users can receive mail for multiple configured domains and send from an authorized domain using any valid local part.

Live service: [https://hpc.email](https://hpc.email)

## Features

- Username-and-password platform accounts, independent from individual mailboxes.
- Unified inbox across all mailboxes, with mailbox filtering when needed.
- Multi-domain catch-all receiving through Cloudflare Email Routing.
- Dynamic sender addresses using a valid local part and an authorized configured domain.
- Responsive React workspace for inbox, sent mail, drafts, message reading, and composition.
- Role-based administration for users, mail, roles, invite keys, API keys, and system settings.
- External API keys with scopes, user binding, expiry, IP allowlists, rate limits, and audit history.
- Optional forwarding to external mailboxes, Telegram, and signed Feishu/Lark webhooks.
- Versioned D1 schema initialization and automated production health checks.

## Architecture

```mermaid
flowchart LR
    Sender["External sender"] --> Routing["Cloudflare Email Routing"]
    Routing --> Worker["HPC Mail Worker"]
    Browser["React Web"] <--> Worker
    Worker <--> D1["D1 · business data"]
    Worker <--> KV["KV · sessions and cache"]
    Worker <--> R2["R2 · attachments"]
    Worker --> Provider["Cloudflare Email / Resend"]
    Worker --> Notify["Email / Telegram / Feishu"]
```

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, React Router 7, Tailwind CSS 4, Radix UI, TanStack Query, Zustand |
| Backend | Cloudflare Workers, Hono, Drizzle ORM |
| Data | Cloudflare D1, KV, R2 |
| Email | Cloudflare Email Routing, Send Email Binding, Resend |
| Delivery | pnpm, Vitest, GitHub Actions, Wrangler |

## Local development

Requirements: Node.js 22 and pnpm 10.

```bash
git clone https://github.com/riba2534/hpc-mail.git
cd hpc-mail

pnpm --dir mail-worker install --frozen-lockfile
pnpm --dir mail-react install --frozen-lockfile

pnpm --dir mail-worker run test:unit
pnpm --dir mail-react run typecheck
pnpm --dir mail-react test
pnpm --dir mail-react run build
```

Start the Worker and React development servers in separate terminals:

```bash
pnpm --dir mail-worker dev
pnpm --dir mail-react dev
```

Open `http://127.0.0.1:3002`. Vite proxies `/api` to the local Worker at `http://127.0.0.1:8787`.

## Cloudflare deployment

The production workflow is triggered by changes to `mail-worker/**`, `mail-react/**`, or the workflow itself on `main`. It performs:

1. configuration validation;
2. Worker and React tests plus TypeScript validation;
3. production dependency audits;
4. React build and Wrangler dry run;
5. Worker and static asset deployment;
6. Worker secret synchronization;
7. versioned D1 schema initialization;
8. production login, API, and health checks.

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `JWT_SECRET`
- `INIT_SECRET`
- `ADMIN_PASSWORD`

Required GitHub Variables include `NAME`, `CUSTOM_DOMAIN`, `DOMAIN`, `ADMIN_USERNAME`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `KV_NAMESPACE_ID`, and `R2_BUCKET_NAME`.

`DOMAIN` must be a JSON array, for example `["example.com","example.net"]`. A fresh schema creates the administrator platform account only; it does not create or bind a mailbox automatically.

Only the current repository schema is supported. There are no legacy-database compatibility migrations. If an older or unknown schema is detected, initialization stops until `REBUILD_DATABASE=true` is explicitly enabled for one deployment; this deletes the old D1 data and recreates the latest schema.

## External API

Administrators create API keys from the API Control page. Complete secrets are shown once and only their SHA-256 digests are stored.

```bash
curl https://mail.example.com/api/v1/status \
  -H "Authorization: Bearer hpc_live_your_api_key"
```

Stable endpoints include status, mailboxes, authorized domains, message listing and detail, attachment download, and message sending. API calls remain constrained by the bound user's role, allowed domains, and send limits.

## Repository layout

```text
hpc-mail/
├── .github/workflows/        # automated deployment
├── design-system/            # React design tokens and page specifications
├── mail-react/               # production React frontend
├── mail-worker/              # Cloudflare Worker backend
├── LICENSE
└── README.md
```

## Security

- Never commit Cloudflare tokens, JWT/Init secrets, administrator passwords, API keys, Resend tokens, or webhook credentials.
- Treat email content as hostile input. Preserve the HTML/CSS sanitizer, Shadow DOM isolation, safe URL rules, and remote-image referrer protection.
- Keep `INIT_SECRET` separate from `JWT_SECRET` and rotate production credentials regularly.
- Update the GitHub `ADMIN_PASSWORD` secret after changing the production administrator password, otherwise deployment health checks will fail.

## Contributing

Issues and focused pull requests are welcome. Before submitting changes, run Worker tests, React tests, TypeScript validation, and the production frontend build. Do not include real email addresses, production identifiers, or credentials in fixtures or screenshots.

## License

HPC Mail is available under the [MIT License](LICENSE).
