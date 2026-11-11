# TiniTraker — Main App (`tinitracker-next`)

> The hospital-facing Next.js application for the TiniTraker maternal & child health tracking platform.

---

## Overview

`tinitracker-next` is the core SaaS application used by hospital staff to manage patients, track pregnancy and immunization stages, send WhatsApp notifications, manage staff accounts, and configure hospital settings.

It also exposes the full **Provider API** (`/api/provider/*`) consumed by the `tinitracker-admin` dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Database | MySQL via Sequelize ORM |
| Auth (hospital users) | httpOnly Cookie (`tinitraker_token`) |
| Auth (provider/admin) | Bearer JWT (issued at `/api/provider/auth/login`, consumed by admin's session bridge) |
| State | Zustand (persisted to `localStorage` for UI state only — no token stored there) |
| Notifications | WhatsApp API + in-app notifications |
| Email / OTP | Nodemailer (optional SMTP) |
| Cron | node-cron (notification batching) |
| Icons | lucide-react |

---

## Project Structure

```
tinitracker-next/
├── app/
│   ├── (app)/                    # Authenticated hospital app layout
│   │   ├── dashboard/            # Main dashboard with live stats
│   │   ├── hospitals/            # Hospital profile & settings
│   │   ├── notifications/        # Notification centre
│   │   ├── patients/             # Patient list + [id] detail pages
│   │   └── staff/                # Staff management
│   ├── (auth)/                   # Public auth pages
│   │   ├── login/                # Hospital user login
│   │   └── setup/                # First-time hospital setup wizard
│   ├── api/                      # All API routes
│   │   ├── auth/                 # Login, register, OTP, change-password, me
│   │   ├── hospitals/            # Hospital CRUD, billing, subscription
│   │   ├── patients/             # Patient CRUD, stages, delivery, history
│   │   ├── notifications/        # Notification send, cron, resend, batch
│   │   ├── app-notifications/    # In-app notification bell
│   │   ├── settings/             # Roles, permissions, system config
│   │   ├── activity/             # Audit log
│   │   ├── setup/                # Setup init & status
│   │   ├── health/               # Health check endpoint
│   │   └── provider/             # ── Provider (admin) API ──
│   │       ├── auth/             #   Provider login & me
│   │       ├── dashboard/        #   Platform-wide stats
│   │       ├── hospitals/        #   Hospital management (CRUD, block)
│   │       ├── subscriptions/    #   Subscriptions + upgrade requests
│   │       ├── admins/           #   Provider admin accounts
│   │       ├── announcements/    #   Broadcast announcements
│   │       ├── payments/         #   Payment records
│   │       ├── revenue/          #   Revenue summaries
│   │       ├── reports/          #   Export reports (CSV/PDF)
│   │       ├── search/           #   Global cross-hospital search
│   │       ├── settings/         #   Platform settings
│   │       └── users/            #   Cross-hospital user view
│   ├── change-password/          # Forced password change page
│   ├── settings/                 # Hospital settings (tabs: profile, subscription, roles, staff)
│   ├── staff/                    # Staff management page
│   ├── stages/                   # Stage template viewer
│   ├── notifications/            # Notification log page
│   ├── register/                 # Hospital self-registration
│   └── setup/                    # Setup wizard
├── archive/
│   └── prototypes/               # Legacy static HTML prototypes (not part of the app)
├── components/
│   └── settings/                 # Settings tab components (Hospital, Roles, Staff, Subscription)
├── lib/
│   ├── db/
│   │   ├── sequelize.js          # DB connection (cached on global)
│   │   └── models/               # Sequelize models (19 models)
│   ├── middleware/
│   │   └── auth.js               # JWT auth middleware
│   ├── seeders/
│   │   ├── providerAdmin.seed.js # Auto-seeds provider admins from env vars
│   │   ├── roles.seed.js         # Default RBAC roles
│   │   └── stageTemplates.seed.js# Pregnancy & immunization stage templates
│   ├── services/
│   │   ├── providerEnvAuth.service.js   # Env-based provider admin auth
│   │   └── platformSettings.service.js  # Platform-wide feature flags & config
│   └── utils/
│       ├── plans.js              # Canonical plan taxonomy helpers
│       └── validation.js         # Shared input validation (dates, IDs, amounts, roles)
├── store/
│   └── uiStore.js                # Zustand UI store (sidebar state, theme)
├── scripts/
│   ├── reset-demo-db.mjs         # ⚠️  DB wipe & demo seed script
│   ├── migrate-schema.mjs        # One-time DDL migration (run once, not on boot)
│   ├── migrate-wellnest-hospital.mjs  # WellNest → TiniTraker patient import
│   └── data/
│       └── wellnest.sql          # ⛔ PII export (gitignored — do not commit)
├── docs/
│   └── roadmap.md                # Architecture & SaaS roadmap notes
├── .env.local                    # ⛔ Secret config (gitignored)
├── .env.example                  # ✅ Safe template (committed)
└── instrumentation.js            # Auto-runs seeders on server start (no DDL)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8+ running locally

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
# Fill in DB credentials, JWT secret, and provider admin credentials
```

### 3. Run schema migrations (first-time or after updates)

```bash
node scripts/migrate-schema.mjs
```

> **Important:** DDL (schema changes) no longer runs automatically on boot. Run `migrate-schema.mjs` explicitly when pulling schema changes from the team.

### 4. Start the dev server

```bash
npm run dev        # Starts on http://localhost:3000
```

The server seeds roles, stage templates, and provider admins on first boot. It does **not** alter the DB schema on startup.

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Description |
|---|---|
| `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASS` | MySQL connection |
| `JWT_SECRET` | **Change before production!** Must also match `JWT_SECRET` in `tinitracker-admin`. |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`) |
| `PROVIDER_ADMIN_EMAIL / PASSWORD` | Primary superadmin credentials |
| `CORS_ORIGIN` | Comma-separated allowed origins (include `tinitracker-admin` URL, e.g. `http://localhost:3001`) |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy (e.g. nginx) |
| `SETUP_TOKEN` | Secret token to initiate hospital self-registration setup |
| `WHATSAPP_API_URL / KEY` | Global WhatsApp provider fallback |
| `NEXT_PUBLIC_APP_NAME` | App name shown in the UI |

---

## Subscription Plan Taxonomy

All plan-related code uses a **canonical set** of plan keys. Do not use legacy keys (`monthly`, `quarterly`, `yearly`, `migrated`, `custom`).

| Plan Key | Description |
|---|---|
| `free_trial` | Trial period (duration set by `default_trial_days` platform setting) |
| `starter` | Entry-level paid plan |
| `professional` | Mid-tier plan |
| `enterprise` | Full-featured plan |

Billing frequency is a separate `billing_cycle` column: `monthly`, `quarterly`, or `yearly`.

---

## Demo / Reset

To wipe the database and start fresh with demo data:

```bash
node scripts/reset-demo-db.mjs
```

To import a WellNest legacy hospital (dry-run first):

```bash
node scripts/migrate-wellnest-hospital.mjs --file=scripts/data/wellnest.sql --dry-run
# Review output, then run without --dry-run to import
```

---

## Database Models

`Hospital` · `User` · `Patient` · `PatientStage` · `PatientHistory` · `Subscription` · `SubscriptionRequest` · `Payment` · `Notification` · `AppNotification` · `Announcement` · `ProviderNotification` · `ProviderAdmin` · `Role` · `RolePermission` · `StageTemplate` · `PlatformSetting` · `SystemConfig` · `ActivityLog`

---

## API Summary

All hospital-scoped routes are under `/api/` and require a valid `Authorization: Bearer <token>` header or `tinitraker_token` httpOnly cookie.

Provider routes (`/api/provider/*`) require a separate provider JWT with `type: 'provider'`. The `tinitracker-admin` app accesses these through its server-side proxy (`/api/provider/[...path]`), which reads an httpOnly `provider_token` cookie and adds the `Authorization` header server-side.

---

## Known Limitations

- **WhatsApp** — requires a valid WhatsApp Business API provider. The UI shows toggle and test options, but no message is sent without a configured `WHATSAPP_API_URL`.
- **SMS fallback / audit toggle / session timeout** — platform settings exist in the UI but their enforcement logic is not yet implemented. These are UI-only placeholders.
- **SMTP** — email/OTP delivery requires `SMTP_*` env vars. Without them, OTP flows will fail silently.

---

## Security Notes

- Hospital user tokens stored as `tinitraker_token` httpOnly cookie (never `localStorage`)
- Provider tokens issued as Bearer JWT, consumed server-side by `tinitracker-admin`'s proxy; never stored in browser storage
- All `console.error` calls log only `.message` strings — never raw Axios objects
- `.env.local` is gitignored; no secrets in committed code
- `wellnest.sql` and other `*_fresh_*.sql` files are gitignored to prevent PII exposure
