# Neutropy Vercel Monitor

Watches all Neutropy Vercel deployments. On failure, alerts Luke via WhatsApp with
two options: acknowledge (cancel rollback) or rollback now. If no response in 5
minutes, auto-rolls back to the last good deployment.

## How it works

```
Vercel deploy fails
      ↓
POST /api/webhook
      ↓
Save pending rollback to KV (5 min timer)
Find last good deployment via Vercel API
      ↓
WhatsApp alert to Luke with two links:
  → /api/acknowledge?id=xxx  (cancel rollback)
  → /api/rollback?id=xxx     (rollback now)
      ↓
Cron runs every minute (/api/rollback-check)
If timer expired and not acknowledged → auto-rollback
      ↓
WhatsApp confirmation of rollback result
```

## Setup

### 1. Create the Vercel project

```bash
cd infrastructure/vercel-monitor
npx vercel --yes --prod
# Note the URL — you'll need it for MONITOR_BASE_URL
```

### 2. Create a Vercel KV store

In Vercel dashboard → Storage → Create KV Store → Link to this project.
Vercel auto-sets the KV env vars.

### 3. Set environment variables

In Vercel dashboard → Settings → Environment Variables, set all vars from `.env.example`:

| Variable | Where to get it |
|----------|----------------|
| `VERCEL_API_TOKEN` | vercel.com/account/tokens |
| `VERCEL_TEAM_ID` | Team settings URL (optional) |
| `VERCEL_WEBHOOK_SECRET` | Set when creating webhook (step 4) |
| `GHL_API_TOKEN` | GHL → Settings → API Keys |
| `GHL_LOCATION_ID` | GHL → Settings → Business Info |
| `LUKE_PHONE` | Your WhatsApp number with country code |
| `MONITOR_BASE_URL` | The URL from step 1 |
| `CRON_SECRET` | Run: `openssl rand -hex 32` |

### 4. Create the Vercel webhook

In Vercel dashboard → Settings → Webhooks:
- URL: `https://[your-monitor-url]/api/webhook`
- Events: `deployment.error`, `deployment.canceled`
- Copy the signing secret → set as `VERCEL_WEBHOOK_SECRET`

### 5. Redeploy

```bash
npx vercel --yes --prod
```

### 6. Test it

```bash
# Check health
curl https://[your-monitor-url]/api/health

# Should return:
# { "ok": true, "service": "neutropy-vercel-monitor", "pendingRollbacks": 0 }
```

To test the full flow: trigger a bad deployment on any Neutropy project.
You should receive a WhatsApp within 30 seconds.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook` | POST | Receives Vercel deployment events |
| `/api/acknowledge?id=xxx` | GET | Cancels auto-rollback (Luke clicks in WhatsApp) |
| `/api/rollback?id=xxx` | GET | Immediate rollback (Luke clicks in WhatsApp) |
| `/api/rollback-check` | GET | Cron job — runs every minute |
| `/api/health` | GET | Health check |

## Vercel projects monitored

The webhook covers all projects in your Vercel account/team. No per-project config
needed — the webhook fires for any deployment event.

## Troubleshooting

**No WhatsApp received on failure:**
- Check Vercel webhook logs in dashboard → Settings → Webhooks → Recent Deliveries
- Check function logs in Vercel → Deployments → Functions → `/api/webhook`
- Verify `GHL_API_TOKEN` and `LUKE_PHONE` are set correctly

**Rollback not executing:**
- Check `/api/rollback-check` function logs
- Verify `CRON_SECRET` matches in env vars
- Verify `VERCEL_API_TOKEN` has permission to promote deployments

**KV errors:**
- Confirm KV store is linked to the project in Vercel dashboard
- KV env vars should be auto-set by Vercel — check they're present
