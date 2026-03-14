// lib/store.js
// Vercel KV (Redis-backed) for tracking pending rollbacks
// Keys: pending:{deploymentId} → JSON object
// TTL: 1 hour (safety cleanup)

import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
})

const PENDING_TTL = 3600 // 1 hour max TTL, cron cleans up at 5 mins

/**
 * Save a pending rollback record when a deployment fails
 */
export async function savePending(deploymentId, data) {
  const record = {
    deploymentId,
    projectName: data.projectName,
    url: data.url,
    previousDeploymentId: data.previousDeploymentId,
    failedAt: Date.now(),
    rollbackAfter: Date.now() + (5 * 60 * 1000), // 5 minutes from now
    acknowledged: false,
    rolledBack: false,
    ...data
  }
  await kv.set(`pending:${deploymentId}`, JSON.stringify(record), { ex: PENDING_TTL })
  return record
}

/**
 * Get a pending rollback record
 */
export async function getPending(deploymentId) {
  const raw = await kv.get(`pending:${deploymentId}`)
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

/**
 * Mark a pending rollback as acknowledged (cancel auto-rollback)
 */
export async function acknowledge(deploymentId) {
  const record = await getPending(deploymentId)
  if (!record) return null
  record.acknowledged = true
  record.acknowledgedAt = Date.now()
  await kv.set(`pending:${deploymentId}`, JSON.stringify(record), { ex: PENDING_TTL })
  return record
}

/**
 * Mark a pending rollback as completed
 */
export async function markRolledBack(deploymentId, newDeploymentId) {
  const record = await getPending(deploymentId)
  if (!record) return null
  record.rolledBack = true
  record.rolledBackAt = Date.now()
  record.rolledBackTo = newDeploymentId
  await kv.set(`pending:${deploymentId}`, JSON.stringify(record), { ex: PENDING_TTL })
  return record
}

/**
 * Get all pending rollbacks that have expired (older than 5 mins, not acknowledged)
 * Used by the cron job
 */
export async function getExpiredPending() {
  const keys = await kv.keys('pending:*')
  if (!keys.length) return []

  const records = await Promise.all(
    keys.map(async (key) => {
      const raw = await kv.get(key)
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    })
  )

  const now = Date.now()
  return records.filter(r =>
    r &&
    !r.acknowledged &&
    !r.rolledBack &&
    r.rollbackAfter < now
  )
}
