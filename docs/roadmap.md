# TiniTraker (WellNest) — Roadmap Guide: Current State → SaaS Plan

**Purpose of this document:** you now have two things — a real, working single-hospital app, and a discussed plan to turn it into a multi-tenant SaaS product. This guide is the bridge between them: what exists today, what's being added, the decisions we've locked in, and what's still open. Use it as the reference point for planning further work.

---

## 1. Current State — what's actually built today

This section mirrors your real codebase as-is. Nothing here has been changed.

### 1.1 Tech stack

```
Frontend A  : tinitracker-next/   (Next.js 14, App Router — primary/active)
Frontend B  : frontend/           (Vite + React SPA — legacy parallel build)
Backend     : backend/            (Express.js + Sequelize)
Database    : MySQL  (DB: wellnest)
Auth        : JWT  (httpOnly cookies + localStorage)
WhatsApp    : wapi.rextrox.in  REST API
Scheduling  : node-cron  (daily batch alerts, 9:00 AM)
```

### 1.2 Directory structure

```
WellNest/
├── backend/                      ← Express REST API (port 5001)
│   ├── config/db.js
│   ├── models/                   ← Sequelize models (6 tables)
│   ├── controllers/
│   ├── routes/
│   ├── middlewares/               ← JWT auth + role guards
│   ├── seeders/                   ← Stage template seed data
│   ├── services/cron.service.js   ← Daily WhatsApp alert scheduler
│   ├── scripts/full-reset.js      ← Database wipe & rebuild
│   └── server.js
│
├── tinitracker-next/              ← Next.js 14 frontend (port 3000)
│   ├── app/{setup,login,dashboard,patients,staff,notifications,activity,hospitals}/
│   ├── lib/db/                    ← Direct Sequelize access (SSR)
│   └── store/authStore.js
│
└── frontend/                      ← Vite + React (port 5173, legacy)
```

### 1.3 The 6 live tables

| Table | Purpose |
|---|---|
| `hospitals` | Root entity — one row per hospital instance, incl. WhatsApp gateway config |
| `users` | All human actors (roles below), scoped to a hospital |
| `stage_templates` | Global, seeded, read-only — defines every ANC/vaccine checkpoint |
| `patients` | One row per patient, scoped to a hospital |
| `patient_stages` | One row per patient × stage_template — the actual schedule |
| `notifications` | Log of every WhatsApp message sent/attempted |

**Current roles in `users.role`:** `admin`, `superadmin`, `staff`, `doctor_pregnancy`, `doctor_immunization` — `superadmin` currently has cross-hospital visibility, which is a legacy behavior the SaaS plan retires (see §3).

### 1.4 Data flow (as built)

**Pregnancy patient:** register (LMP or direct EDD) → 10 ANC stage rows auto-created → checkups update stage status/data → EDD changes recalculate pending stage dates → delivery recorded → status becomes `completed`, immunization stage rows auto-created for the newborn.

**Immunization patient:** register directly with `child_dob` → stage rows auto-created → checkups update stage status/data.

### 1.5 Automated alerts

Daily cron at 9:00 AM: sends `reminder_7d` / `reminder_1d` / `reminder_today` for upcoming stages, marks overdue `pending` stages as `missed`, logs every attempt to `notifications`. Only `admin`, `superadmin`, `staff` can trigger this manually — doctors cannot.

### 1.6 Real API routes (keep as-is — do not restructure)

| Base | Routes |
|---|---|
| `/api/setup` | `POST /init` — one-time hospital + admin creation, disabled after first use (409 if hospital exists) |
| `/api/auth` | `POST /login`, `GET /me`, `POST /register-staff`, `GET /staff`, `PUT /staff/:id` |
| `/api/hospitals` | `GET` / `PUT` hospital settings |
| `/api/patients` | CRUD patients |
| `/api/patients/:id/stages` | GET/PUT stage status, skip, date override, EDD update, delivery |
| `/api/notifications` | List, send manual, batch trigger |

---

## 2. Decisions locked in (this conversation)

These are final calls — build against these, not against earlier draft numbers.

### 2.1 Roles: no `superadmin`

- Provider-level access (cross-hospital) lives **only** in the new `provider_admins` table — never in `users.role`.
- `users.role` keeps exactly four values: `admin`, `staff`, `doctor_pregnancy`, `doctor_immunization`.
- `admin` is the sole top-level role *inside* a hospital.
- **Migration note:** any existing `users` rows with `role = 'superadmin'` need a decision on where they go (most likely: convert to a `provider_admins` row, or downgrade to hospital `admin` if that specific person should stay hospital-scoped). Flagging this explicitly — it's not yet decided.

### 2.2 Pregnancy stage schedule: keep as-is (10 stages)

Research confirmed two standards exist — **WHO 2016 ANC model** (8-contact minimum: 1 in trimester 1, 2 in trimester 2, 5 in trimester 3) and **NHS** (10 appointments for a first pregnancy, 7 for a later one, at booking + 14-16/20/25/28/31/34/36/38/40/41 weeks). Your current 10-stage build already matches the **NHS first-pregnancy model** — kept unchanged.

### 2.3 Immunization stage schedule: expand to match full IAP schedule (birth → 12 years)

India's real standard is the **IAP (Indian Academy of Pediatrics) schedule**, aligned with the government's Universal Immunization Programme — not a generic global count. Your current build stops at `IMM_10Y` (12 stages, ending at 10 years). The full IAP schedule through age 12 has these distinct **clinic-visit** checkpoints (multiple vaccines are co-administered per visit, so this counts visits, not individual doses):

| # | Stage code (proposed) | Age window | Main vaccines given at this visit |
|---|---|---|---|
| 1 | `IMM_BIRTH` | At birth | BCG, Hepatitis B (birth dose), OPV zero dose |
| 2 | `IMM_6W` | 6–8 weeks | DTwP/DTaP-1, IPV-1, Hib-1, Rotavirus-1, PCV-1, Hep B-2 |
| 3 | `IMM_10W` | 10–12 weeks | DTwP/DTaP-2, IPV-2, Hib-2, Rotavirus-2, PCV-2 |
| 4 | `IMM_14W` | 14–16 weeks | DTwP/DTaP-3, IPV-3, Hib-3, Rotavirus-3, PCV-3 |
| 5 | `IMM_6M` | 6 months | Hep B-3, Influenza-1 |
| 6 | `IMM_9M` | 9 months | MMR-1, Typhoid conjugate |
| 7 | `IMM_12M` | 12 months | Hepatitis A-1 |
| 8 | `IMM_15M` | 15 months | MMR-2, Varicella-1, PCV booster |
| 9 | `IMM_18M` | 16–18 months | DTwP/DTaP booster-1, IPV booster, Hib booster, Hep A-2, Varicella-2 |
| 10 | `IMM_5Y` | 4–6 years | DTwP/DTaP booster-2, MMR-3, Typhoid booster |
| 11 | `IMM_10Y` | 9–12 years | HPV (course starts) |
| 12 | `IMM_11Y` | 10–12 years | Tdap |

**= 12 stages total** (up from the current 12 stages, but now correctly reaching **12 years** instead of stopping at 10). One design call made here: the IAP schedule technically lists "16–18 months" and "18 months" as two slightly-offset windows for different vaccines — these are merged into a single `IMM_18M` visit (#9) since in practice a clinic schedules one appointment to cover both, not two visits six weeks apart. Flagging this so it's an explicit, reviewable choice rather than a silent one.

**Action needed on your side:** `backend/seeders/` currently seeds the old 12-stage set ending at `IMM_10Y`(10yr) — it needs to be updated to this new 12-stage set ending at 12yr. This is a data change, not a schema change (`stage_templates` table structure doesn't need to change). Existing patients who already have `patient_stages` rows generated from the old template set will **not** retroactively get the new stages — that needs a one-time backfill script if you want existing patients caught up.

### 2.4 API structure: mirror your real routes, don't invent new granularity

Earlier draft materials used more granular routes (`/dashboard-stats`, `/stages/current`, `/stages/upcoming`, separate `/skip` / `/visit` / `/date-override` endpoints). Going forward, new SaaS-layer endpoints follow **your actual existing pattern** instead:

- New transfer/history endpoints nest under `/api/patients/:id/...` exactly like your existing `/api/patients/:id/stages` does.
- New payment endpoints nest under `/api/hospitals/:id/...` exactly like your existing hospital settings routes do.
- No new top-level route groups invented beyond what's needed for `provider_admins` / `subscriptions`.

---

## 3. Target state — the SaaS layer being added on top

Nothing in §1 changes structurally. These are **new, additive** tables and one **new relationship rule** on top of the existing 6 tables.

### 3.1 New tables

| Table | Purpose |
|---|---|
| `provider_admins` | WellNest's own internal staff — the only place with cross-hospital access. Creates hospitals, manages subscriptions. |
| `subscriptions` | Plan history per hospital (free_trial/monthly/quarterly/yearly/custom). Multiple rows per hospital = full renewal history; gates login when expired. |
| `payments` | One row per hospital payment/renewal. Past and current payments both kept — nothing overwritten. |
| `patient_history` | Append-only audit log per patient: every stage visit, skip, EDD change, delivery, and hospital transfer. |

### 3.2 New relationship: patient hospital transfer

- `patients.hospital_id` (already exists) becomes **updatable** in one specific flow: staff search an existing patient by WhatsApp number; if found at a *different* hospital that also runs TiniTraker, staff see that existing record and can confirm a transfer.
- Transfer = **update the existing row's `hospital_id`**, never create a duplicate patient. The same `patient_id` keeps every stage and visit it already has.
- Every transfer is logged as a `hospital_transferred` event in `patient_history` (old hospital, new hospital, who did it, when).

### 3.3 Role/permission summary for the new layer

| Capability | provider_admins | hospital `admin` | `staff` | doctors |
|---|---|---|---|---|
| Create hospitals, manage subscriptions | Yes | No | No | No |
| Transfer a patient between hospitals | No | Yes | Yes | No |
| View a patient's full history log | No | Yes | Yes | Yes |
| View hospital payment history | No | Yes | No | No |
| Record a hospital payment | Yes | No | No | No |

---

## 4. Gap analysis — what changes, table by table

| Item | Status today | Target | Change type |
|---|---|---|---|
| `hospitals` | ✅ exists | unchanged | none |
| `users` | ✅ exists, has `superadmin` | drop `superadmin` from enum | **breaking** — needs data migration first |
| `stage_templates` (pregnancy) | ✅ 10 stages | unchanged | none |
| `stage_templates` (immunization) | ⚠️ 12 stages, ends at 10yr | 12 stages, ends at 12yr (new codes) | **seed data update** + backfill for existing patients |
| `patients` | ✅ exists | `hospital_id` becomes transferable | logic change only, no schema change |
| `patient_stages` | ✅ exists | unchanged | none |
| `notifications` | ✅ exists | unchanged | none |
| `provider_admins` | ❌ doesn't exist | new table | **additive** |
| `subscriptions` | ❌ doesn't exist | new table | **additive** |
| `payments` | ❌ doesn't exist | new table | **additive** |
| `patient_history` | ❌ doesn't exist | new table | **additive** |

---

## 5. Open questions (not yet decided)

1. **Existing `superadmin` users** — how should currently-existing rows with this role be migrated? (§2.1)
2. **Existing patients' immunization stages** — do you want a backfill script to add the 2 missing/renamed checkpoints (up through 12yr) to patients registered under the old 12-stage/10yr set, or only apply the new schedule to newly registered patients going forward?
3. **Cross-hospital history visibility** — when a patient transfers, should the new hospital see the previous hospital's free-text clinical notes in full, or only stage completion dates? (Carried over from the architecture doc's Issue #12 — still unresolved.)
4. **HPV vaccine at 9–12yr** — this is often given to girls only in the government UIP, but IAP recommends it for all children. Confirm whether `IMM_10Y` (HPV) should be gender-conditional in the stage-generation logic or shown to everyone and made optional/skippable.

---

## 6. Suggested build order

1. **Schema migration** — add `provider_admins`, `subscriptions`, `payments`, `patient_history`; resolve and migrate any `superadmin` rows; update `stage_templates` seed data for immunization.
2. **Patient transfer flow** — WhatsApp-number lookup across hospitals, transfer confirmation, `hospital_id` update, `patient_history` log entry.
3. **History log wiring** — hook `patient_history` writes into the existing stage-visit/skip/EDD/delivery code paths (these already exist; this just adds a log line to each).
4. **Provider panel + payments** — hospital creation, subscription management, payment recording (provider-only), payment history view (hospital admin, read-only).

---

*This guide reflects the current codebase exactly as provided, plus every decision made in this conversation. Update it as further decisions are made — it's meant to stay the single source of truth for where the project is and where it's headed.*
