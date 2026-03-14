// api/health.js
// Basic health check — confirms the monitor is live
// Also shows count of currently pending rollbacks

import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_REST_TOKEN
})

export default async function handler(req, res) {
  try {
    const keys = await kv.keys('pending:*')
    const pending = keys.length

    return res.status(200).json({
      ok: true,
      service: 'neutropy-vercel-monitor',
      timestamp: new Date().toISOString(),
      pendingRollbacks: pending
    })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    })
  }
}
