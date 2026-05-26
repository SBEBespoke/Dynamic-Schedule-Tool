# Dynamic Schedule Tool — Project Phases

---

## Phase 1 — Project Foundation ✅ COMPLETE
- React + Vite project scaffold
- GitHub Pages deployment via GitHub Actions
- Supabase database schema (10 tables, Row Level Security)
- Authentication (login/logout)
- App routing with role-based access
- Setup guide (SETUP.md)

---

## Phase 2 — Event & Data Management ✅ COMPLETE
- Event creation and selection
- Day management (add, edit, delete)
- On-track session CRUD (with Must Start At / Must Finish By constraints)
- People management (name, WhatsApp, radio channel)
- Admin panel (event config + Excel import with column mapping)
- Toast notification system
- Real-time sync across all connected devices

---

## Phase 3 — Core Views ✅ COMPLETE
- Activations view — area columns with sessions that depend on on-track timing
- Session assignment — link people to on-track and area sessions
- Conflict detection — flag when a person is double-booked (badge in header + per-card)
- My Schedule view — personal read-only view linked via user account

---

## Phase 4 — Live Operations ✅ COMPLETE
- Live Track Update view — quick slip buttons (+5/10/15/20m), custom input, duration override
- Cascade engine — automatically pushes downstream sessions when one runs over
- Activations update in real time as linked on-track sessions slip
- Slip log — timestamped audit trail of every adjustment
- Reset at source — cascade-only sessions show hint pointing to the upstream cause

---

## Phase 5 — Notifications & Extra Features
- WhatsApp notifications via Twilio — alert assigned people when their session slips
- Broadcast Alert — send a message to all or a filtered group of team members
- Weather widget — live conditions at the circuit (free, no API key needed)
- Session briefing notes — visible to assigned people in My Schedule
- Radio channel display in My Schedule
- Pre-event checklist — configurable tick-off list assignable to people

---

## Phase 6 — Export & Polish
- Run Sheet PDF export — printable daily schedule
- End-of-Day Slip Report — export of all slips applied, as PDF or CSV
- Mobile layout pass — ensure all views work cleanly on a phone
- User invitation flow — invite team members via email from within the app
- Admin guide document — plain-English instructions for running a new event

---

## Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Project Foundation | ✅ Complete |
| 2 | Event & Data Management | ✅ Complete |
| 3 | Core Views | ✅ Complete |
| 4 | Live Operations | ✅ Complete |
| 5 | Notifications & Extra Features | ⏳ Pending |
| 6 | Export & Polish | ⏳ Pending |
