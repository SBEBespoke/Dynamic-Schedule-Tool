# Live Schedule Manager — Setup Guide

This guide walks you through getting the app live on GitHub Pages with a working Supabase backend. Follow each step in order. No developer experience needed.

---

## What you'll need
- A [GitHub](https://github.com) account (free)
- A [Supabase](https://supabase.com) account (free)
- [Node.js](https://nodejs.org) installed on your computer (LTS version)
- This project folder on your computer

---

## Step 1 — Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it something like `dynamic-schedule-tool`
3. Set it to **Private** (recommended) or Public
4. Do NOT initialise with a README — leave all boxes unticked
5. Click **Create repository**
6. GitHub will show you a page with setup commands. Copy the repo URL (e.g. `https://github.com/yourusername/dynamic-schedule-tool.git`)

---

## Step 2 — Push the project to GitHub

Open **Terminal** (Mac: press ⌘ + Space, type Terminal, press Enter).

Run these commands one at a time, replacing the URL with your repo URL from Step 1:

```bash
cd "/Users/bennetts/Documents/SB/Claude/Projects/03. ADL GF/04. Dynamic Schedule Tool"
git init
git add .
git commit -m "Initial commit — Phase 1"
git branch -M main
git remote add origin https://github.com/yourusername/dynamic-schedule-tool.git
git push -u origin main
```

---

## Step 3 — Enable GitHub Pages

1. In your GitHub repo, click **Settings** (top tab bar)
2. In the left sidebar, click **Pages**
3. Under "Source", select **GitHub Actions**
4. Click Save

---

## Step 4 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Name it `live-schedule-manager` (or anything you like)
4. Choose a strong database password — **save this somewhere safe**
5. Choose the **Sydney** region (closest to Adelaide)
6. Click **Create new project** — wait ~2 minutes for it to provision

---

## Step 5 — Run the Database Schema

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase/schema.sql` from this project folder
4. Copy the entire contents and paste it into the SQL Editor
5. Click **Run** (or press Ctrl/Cmd + Enter)
6. You should see "Success. No rows returned."

---

## Step 6 — Get Your Supabase Keys

1. In Supabase, click **Settings** (gear icon, bottom of left sidebar)
2. Click **API**
3. Copy two values:
   - **Project URL** — looks like `https://abcdefghijkl.supabase.co`
   - **anon / public key** — a long string starting with `eyJ...`

---

## Step 7 — Add Secrets to GitHub

GitHub Actions needs your Supabase keys to build the app. These are stored as encrypted secrets — they are never visible in your code.

1. In your GitHub repo, click **Settings**
2. In the left sidebar, click **Secrets and variables → Actions**
3. Click **New repository secret** for each of the following:

| Secret Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase Project URL from Step 6 |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key from Step 6 |
| `VITE_BASE_PATH` | `/dynamic-schedule-tool/` (must match your repo name exactly, with slashes) |

---

## Step 8 — Trigger a Deployment

1. Go to your GitHub repo → **Actions** tab
2. You should see a workflow run already in progress (triggered by your push in Step 2)
3. If not, click **Deploy to GitHub Pages** → **Run workflow**
4. Wait ~2 minutes for the green tick ✓
5. Your app will be live at: `https://yourusername.github.io/dynamic-schedule-tool/`

---

## Step 9 — Create Your Admin Account

1. In Supabase, click **Authentication** in the left sidebar
2. Click **Users → Add user → Create new user**
3. Enter your email (`shaun@sbebespoke.com`) and a strong password
4. Click **Create user**

---

## Step 10 — Promote Yourself to Super Admin

1. In Supabase, click **SQL Editor → New query**
2. Paste and run this query (your email is already filled in):

```sql
UPDATE user_profiles
SET role = 'super_admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'shaun@sbebespoke.com');
```

3. You should see "1 row affected"

---

## Step 11 — Test the App

1. Open `https://yourusername.github.io/dynamic-schedule-tool/` in your browser
2. Sign in with the email and password you created in Step 9
3. You should see the Events page
4. Click **+ New Event** to create your first event

---

## Inviting Team Members

For each person who needs access:

1. In Supabase → **Authentication → Users → Add user → Create new user**
2. Enter their email and a temporary password
3. Send them the app URL and their temporary password
4. To set their role, run this query in the SQL Editor:

```sql
UPDATE user_profiles
SET role = 'ops_lead'   -- or: area_manager, team_member
WHERE id = (SELECT id FROM auth.users WHERE email = 'their@email.com');
```

Roles:
- `super_admin` — full access (you)
- `ops_lead` — can apply slips, manage schedule
- `area_manager` — view only + their area
- `team_member` — My Schedule view only

---

## Local Development (optional)

If you want to run the app on your computer before pushing changes:

```bash
cd "/Users/bennetts/Documents/SB/Claude/Projects/03. ADL GF/04. Dynamic Schedule Tool"
cp .env.example .env
# Edit .env and fill in your Supabase URL and anon key
npm install
npm run dev
```

The app will open at `http://localhost:5173`

---

## Troubleshooting

**The app shows a blank white page**
- Check that your `VITE_BASE_PATH` secret matches your repo name exactly, including the slashes (e.g. `/dynamic-schedule-tool/`)
- Re-run the GitHub Actions workflow after fixing

**"Missing Supabase environment variables" error**
- Double-check the GitHub secrets are named exactly as shown in Step 7

**"Invalid login credentials"**
- Make sure you created the user in Supabase Auth (Step 9), not just in the database

**Changes not appearing after a push**
- Check the Actions tab in GitHub — the deployment takes ~2 minutes
- Force-refresh the browser (Ctrl/Cmd + Shift + R)
