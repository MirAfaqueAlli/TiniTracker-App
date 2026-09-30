# TiniTracker — Main App (`tinitracker-next`)

> The hospital-facing Next.js application for the TiniTracker maternal & child health tracking platform.

---

## Overview

`tinitracker-next` is the core SaaS application used by hospital staff to manage patients, track pregnancy and immunization stages, send WhatsApp notifications, manage staff accounts, and configure hospital settings.

It also exposes the full **Provider API** (`/api/provider/*`) consumed by the `tinitracker-admin` dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | MySQL via Sequelize ORM |
| Auth | JWT (httpOnly cookies + Bearer tokens) |
| State | Zustand (persisted) |
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
│   ├── dashboard/                # (redirect to (app)/dashboard)
│   ├── login/                    # (redirect alias)
│   ├── patients/ + [id]/         # Patient pages (top-level aliases)
│   ├── settings/                 # Hospital settings (tabs: profile, subscription, roles, staff)
│   ├── staff/                    # Staff management page
│   ├── stages/                   # Stage template viewer
│   ├── notifications/            # Notification log page
│   ├── register/                 # Hospital self-registration
│   ├── setup/                    # Setup wizard
│   └── provider/                 # Provider portal (login + dashboard)
│       ├── login/
│       └── dashboard/
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
│   │   └── providerEnvAuth.service.js # Env-based provider admin auth
│   └── utils/                    # Shared utilities
├── store/
│   └── authStore.js              # Zustand auth store (cookie + localStorage)
├── styles/                       # Global CSS
├── scripts/
│   └── reset-demo-db.mjs         # ⚠️  DB wipe & demo seed script
├── docs/
│   └── roadmap.md                # Architecture & SaaS roadmap notes
├── .env.local                    # ⛔ Secret config (gitignored)
├── .env.example                  # ✅ Safe template (committed)
└── instrumentation.js            # Auto-runs seeders on server start
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

### 3. Start the dev server

```bash
npm run dev        # Starts on http://localhost:3000
```

The server automatically syncs the DB schema and seeds roles, stage templates, and provider admins on every boot.

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Description |
|---|---|
| `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASS` | MySQL connection |
| `JWT_SECRET` | **Change before production!** |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`) |
| `PROVIDER_ADMIN_EMAIL / PASSWORD` | Primary superadmin credentials |
| `WHATSAPP_API_URL / KEY` | Global WhatsApp provider fallback |
| `NEXT_PUBLIC_APP_NAME` | App name shown in the UI |

---

## Demo / Reset

To wipe the database and start fresh with demo data:

```bash
node scripts/reset-demo-db.mjs
```

This creates one demo hospital with an active subscription and seeds the provider admin account.

---

## Database Models

`Hospital` · `User` · `Patient` · `PatientStage` · `PatientHistory` · `Subscription` · `SubscriptionRequest` · `Payment` · `Notification` · `AppNotification` · `Announcement` · `ProviderNotification` · `ProviderAdmin` · `Role` · `RolePermission` · `StageTemplate` · `PlatformSetting` · `SystemConfig` · `ActivityLog`

---

## API Summary

All hospital-scoped routes are under `/api/` and require a valid `Authorization: Bearer <token>` header or `tinitracker_token` cookie.

Provider routes (`/api/provider/*`) require a separate provider JWT with `type: 'provider'`.

---

## Security Notes

- Tokens stored as `tinitracker_token` cookie (httpOnly on server routes) and in Zustand (`tinitracker-auth`)
- All `console.error` calls log only `.message` strings — never raw Axios objects
- `.env.local` is gitignored; no secrets in code
