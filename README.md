# volunteer-management

This repository is publicly visible for portfolio and review purposes only.
Commercial or other use requires written permission.

# BFC Volunteer Portal

A full-stack volunteer management platform for **Bingham Family Clinic**, built with Next.js 15 and Supabase. The app is installable as a PWA and covers the full lifecycle of clinic volunteer operations — scheduling, attendance, callouts, shift coverage, messaging, and administrative oversight.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [User Roles & Views](#user-roles--views)
- [Features by Role](#features-by-role)
  - [Volunteer View](#volunteer-view)
  - [Admin View](#admin-view)
  - [Clinical Supervisor View](#clinical-supervisor-view)
- [Domain Concepts](#domain-concepts)
  - [Affiliations](#affiliations)
  - [Roles / Positions](#roles--positions)
  - [Shifts & Scheduling](#shifts--scheduling)
  - [Callouts & Coverage](#callouts--coverage)
  - [Provider Credentials](#provider-credentials)
- [Data Architecture](#data-architecture)
- [Time Handling](#time-handling)
- [Messaging System](#messaging-system)
- [Push Notifications](#push-notifications)
- [PWA](#pwa)
- [Performance Optimizations](#performance-optimizations)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Overview

The BFC Volunteer Portal replaces manual spreadsheets and group-chat coordination for a free community health clinic. Volunteers can clock in/out, submit callouts, request shift coverage, and communicate with the team. Admins manage the full schedule, onboarding, review hours submissions, track provider credential expiration, and maintain an audit log of all administrative actions. Clinical Supervisors get a focused read-only view of their own shifts with live attendance and language coverage data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, `'use client'` components) |
| Backend / Database | Supabase (PostgreSQL + Auth + Storage + RPC) |
| Auth | Supabase Auth (email/password, session persisted to `localStorage` under key `bingham-app`) |
| File Storage | Supabase Storage |
| Push Notifications | Web Push API (`web-push` v3) |
| PWA | `manifest.json`, service worker via `next-pwa` conventions |
| Package Manager | npm |

---

## Project Structure

```
/
├── app/
│   ├── page.js                  # Login / landing
│   ├── volunteer/
│   │   └── page.js              # Volunteer view (clock, schedule, callouts, messages, account)
│   ├── admin/
│   │   └── page.js              # Admin dashboard
│   ├── clinical-supervisor/
│   │   └── page.js              # Clinical Supervisor view
│   ├── forgot-password/
│   │   └── page.js              
│   ├── reset-password/
│   │   └── page.js              
│   ├── api/
│   |   ├── send-message/
│   |   |   └── route.js         # Authenticated message-send endpoint
│   |   ├── send-push/
│   |   |   └── route.js 
│   |   └── cron/shift-reminder/
│   |       └── route.js         
|   ├── globals.css
|   └── layout.js
├── components/
│   ├── DataDashboard.jsx        # Charts / aggregate stats (admin Data tab)
│   ├── Pipeline.jsx             # Volunteer recruitment pipeline (admin)
│   ├── Waitlist.jsx             # Scheduling waitlist (admin)
│   ├── ClinicOpenings.jsx       # Open slot display (admin)
│   └── MessageCard.jsx          # Shared message bubble component
├── lib/
│   ├── supabase.js              # Supabase client (singleton)
│   ├── constants.js             # DAYS, SHIFTS, ROLES, SCHOOLS, MAJORS, action labels/colors
│   ├── timeUtils.js             # Mountain Time helpers
│   ├── messageUtils.js          # Inbox filter logic
│   └── pushNotifications.js     # Subscribe / unsubscribe helpers
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── logo3.png                # App icon (192×512)
│   ├── logo.png                
│   └── sw.js                    # Service worker (push notifications)
└── next.config.js
```

---

## User Roles & Views

The app has three distinct authenticated views, each with its own route. Role resolution happens on the server side of each page's init function.

| Route | Who can access | How access is determined |
|---|---|---|
| `/volunteer` | All authenticated users | Default for `role = 'volunteer'` |
| `/admin` | Admins only | `role = 'admin'` in `profiles` |
| `/clinical-supervisor` | Clinical supervisors + admins | `default_role = 'Clinical Supervisor'` or `role = 'admin'` |

Users with `role = 'admin'` or `default_role = 'Clinical Supervisor'` see a **Switch View** button to toggle between their primary view and `/volunteer`. If `'affiliation' = 'intern'`, a weekly reporting hours feature is seen, and if `'affiliation' = 'provider'`, they are allowed to change the experiation dates of their credentials.
---

## Features by Role

### Volunteer View

Located at `/volunteer/page.js`. Tabs load lazily — data for a tab is only fetched the first time it is visited, using a `fetchedTabs` ref as a dedup guard.

**Clock tab** (critical path — loaded on init)
- One-tap clock in / clock out
- Automatically resolves the volunteer's scheduled role for the current shift window and stamps it on the shift record
- Falls back to `default_role` if no schedule match is found

**Schedule tab**
- Displays the volunteer's personal recurring schedule
- Filters by week-of-month pattern (`every`, `odd` = 1st & 3rd, `even` = 2nd & 4th)
- Respects `start_date` / `end_date` bounds on schedule entries

**Call-Out tab**
- Single-shift callout: date + shift + role + optional reason
- Date-range callout: auto-generates one callout row per scheduled weekday shift within the range, skipping weekends and days with no schedule match
- Open Shifts list: shows approved callouts with no coverage assigned; volunteers can tap "I can cover" to submit a cover request

**Messages tab**
- Inbox, Sent, and Compose sub-views
- Paginated — loads 10 messages at a time, with a "Load older" button
- Compose supports: Admin, Everyone, My Shift, My Role, or Individual recipient types
- Optional image attachment (JPEG/PNG/WebP/GIF, max 5 MB), uploaded to Supabase Storage
- Unread badge on the tab button; messages marked read on inbox open
- Broadcast messages show a view count badge (eye icon + number)

**Report Hours tab** (Intern affiliation only — tab is hidden for all other affiliations)
- Logs hours directly as a shift record
- Sends a structured weekly progress report message to all users with `default_role = 'Director'`

**Account tab**
- Total hours and completed shift count
- Expandable shift history (last 10)
- Provider credential cards with expiry status (Provider affiliation only)
- Submit hours form for off-system hours (pending admin approval)
- Push notification toggle
- Password change

---

### Admin View

Located at `/admin/page.js`. Uses a `loadedTabs` ref to prevent re-fetching on tab revisit. All heavy lists are paginated.

**Live tab**
- Volunteers expected but not yet clocked in (cross-references schedule, callouts, and active shifts)
- Active shifts list (everyone currently clocked in, clickable to open volunteer detail)
- Today's callouts with covered/open/pending status

**Scheduling tab**
- Day × shift grid (Mon–Fri, 10–2 / 2–6)
- Per-role assignment with optional start/end date, week pattern, and schedule note
- `ROLE_SUGGESTIONS` cap enforcement (warns when a role slot is full)
- Date picker to preview schedule on a specific date, showing callout/cover status inline
- Waitlist and Clinic Openings sub-panels

**Volunteers tab**
- Filterable list: search, affiliation, role, default position, active/inactive toggle
- Provider Credentials Summary Banner — collapsible alert listing any expired or expiring-soon credentials across all active providers
- Volunteer detail: full profile, edit form, status change (deactivate with reason / reactivate), recent shifts (last 10, lazy), recurring schedule (lazy), total hours (fetched on open)

**Pipeline tab** — recruitment / onboarding pipeline (see `Pipeline.jsx`)

**Shifts tab**
- Paginated shift log (25 at a time, "load more")
- Filter by volunteer
- Inline edit (clock in/out in Mountain Time, role) and delete
- Manual shift entry form

**Call-Outs tab**
- Pending callouts with approve / deny actions
- Open shifts (approved, uncovered) with pending cover requests to assign or deny
- Collapsed "Covered / Closed" history section

**Hours tab**
- Pending submissions shown immediately; approving creates a shift record automatically
- Reviewed history loaded lazily on demand (paginated, 20 at a time)

**Recent Activity tab** (Audit log)
- Filtered to the last 2 weeks, paginated 30 at a time
- Filterable by admin, action type, and date range
- Every admin mutation calls `audit()` which writes to `audit_logs`

**Add Volunteer tab**
- Creates a Supabase Auth account + `profiles` row in one form
- Affiliation-conditional fields: missionary (SMA info), student (school/major), intern (advisor/school/dept), provider (credential dates)

**Data tab** — aggregate charts and statistics (see `DataDashboard.jsx`)

---

### Clinical Supervisor View

Located at `/clinical-supervisor/page.js`. Read-only. Scoped to the shifts the CS user is personally scheduled for.

**Live tab**
- Expected-but-not-clocked-in panel (same logic as admin Live tab)
- Full active-shift list
- Today's callouts
- Birthday highlight for any volunteer whose birthday matches today's Mountain Time date

**Schedule tab**
- Shows only the shifts the CS is personally scheduled for
- Expandable volunteer rows with phone, languages, and affiliation
- "in" badge on volunteers currently clocked in during the active slot

**Language Coverage tab**
- Per-shift language bubble list (scoped to that shift's volunteers only)
- Bubbles highlighted green if at least one speaker is currently clocked in
- Click any bubble to open a modal listing all speakers for that shift, with clock-in status and phone numbers
- "Multilingual Volunteers by Shift" reference table

---

### Shifts & Scheduling

The clinic runs **weekday shifts only**, Monday–Friday:

| Shift ID | Window |
|---|---|
| `10-2` | 10:00 AM – 2:00 PM MT |
| `2-6` | 2:00 PM – 6:00 PM MT |

A `schedule` row represents a recurring assignment: `(volunteer_id, day_of_week, shift_time, role)` plus optional `start_date`, `end_date`, and `week_pattern` (`every` / `odd` / `even`). The `odd`/`even` pattern refers to the week-of-month count for that day (e.g. "2nd Monday of the month" = even).

### Callouts & Coverage

When a volunteer can't make a shift they submit a **callout**. An admin approves or denies it.

- **Approved + no `covered_by`** → shift is open for coverage
- Volunteers can submit a **cover request** (`shift_cover_requests`) on any open shift
- Admin approves one cover request; all other requests for that callout are auto-denied
- **Approved + `covered_by` set** → shift is covered

### Provider Credentials

Five credential expiration dates are tracked per provider: License, BLS, DEA, FTCA, TB. Each field can hold:
- An ISO date string (`YYYY-MM-DD`)
- `"N/A"` (not applicable — DEA only)
- `"expired"` (manually marked)
- `null` (not on file)

`credentialStatus()` returns one of `ok`, `expiring` (within 30 days), `expired`, `na`, or `missing`. The admin volunteer list shows a collapsible banner summarising all flagged credentials across active providers.

---

## Data Architecture

See Supabase.

## Time Handling

All timestamps are stored in UTC. The clinic operates in **Mountain Time (America/Denver)**, which is UTC-7 (MDT) in summer and UTC-6 (MST) in winter. `lib/timeUtils.js` provides:

| Function | Purpose |
|---|---|
| `getMountainNow()` | Current `Date` object representing Mountain Time wall clock |
| `getMountainLabel()` | Returns `"MDT"` or `"MST"` based on current UTC offset |
| `asUTC(ts)` | Parses a timestamp string to a UTC `Date`, appending `Z` if no timezone suffix |
| `formatMountain(ts)` | `hh:mm AM/PM` in Mountain Time |
| `formatDate(ts)` | `Mon D` in Mountain Time |
| `formatDateTime(ts)` | `Mon D, hh:mm AM/PM` in Mountain Time |
| `toMountainInputValue(ts)` | UTC ISO → `datetime-local` input value in Mountain Time |
| `fromMountainInputValue(val)` | `datetime-local` value in Mountain Time → UTC ISO string (DST-safe iterative correction) |

`fromMountainInputValue` uses an iterative correction loop (up to 4 passes) to correctly handle DST boundary inputs where a naive `UTC+7` offset would be wrong.

---

## Messaging System

Messages are sent via the `/api/send-message` route (requires a valid Supabase JWT in the `Authorization` header). Recipient types:

| `recipient_type` | Audience |
|---|---|
| `admin` | Users with `role = 'admin'` |
| `everyone` | All active users |
| `volunteer` | A single user (`recipient_volunteer_id`) |
| `shift` | All volunteers scheduled for a specific `day` + `shift_time` |
| `role` | All volunteers with a given `default_role` |
| `affiliation_missionary` | All volunteers with `affiliation = 'missionary'` |

`getInboxMessages()` in `lib/messageUtils.js` filters the message list to only messages the current user should see in their inbox (excludes own sent messages and affiliation-gated messages they don't qualify for).

---

## Push Notifications

`lib/pushNotifications.js` wraps the browser Push API:

- `subscribeToPush(supabase, userId)` — requests notification permission, registers a push subscription via the service worker, and stores the subscription endpoint in the database
- `unsubscribeFromPush(supabase, userId)` — removes the push subscription from both the browser and the database

The service worker (`public/sw.js`) handles incoming push events. Server-side push delivery uses the `web-push` npm package.

---

## PWA

The app is installable as a standalone PWA. This is key in allowing for push notifications. Key manifest values:

## Environment Variables

Create a `.env.local` file at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
CRON_SECRET = cron-secret
NEXT_PUBLIC_VAPID_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=mailto:admin@yourdomain.com
```

The Supabase client is initialised once in `lib/supabase.js` and imported everywhere.

---