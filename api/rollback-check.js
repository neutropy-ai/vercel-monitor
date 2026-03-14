// api/rollback-check.js
// Vercel Cron Job — runs every minute (see vercel.json)
// Finds pending rollbacks where 5 minutes have elapsed and Luke hasn't responded
// Executes the rollback automatically

import { getExpiredPending, markRolledBack } from '../lib/store.js'
import { rollbackDeployment } from '../lib/vercel.js'
import { alertRollbackComplete, alertRollbackFailed } from '../lib/ghl.js'

export default async function handler(req, res) {
  // Vercel cron requests include this header — reject anything else
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let expired
  try {
    expired = await getExpiredPending()
  } catch (err) {
    console.error('Failed to fetch expired pending rollbacks:', err)
    return res.status(500).json({ error: err.message })
  }

  if (!expired.length) {
    return res.status(200).json({ ok: true, processed: 0 })
  }

  console.log(`Found ${expired.length} expired rollback(s) to process`)

  const results = []

  for (const record of expired) {
    const { deploymentId, projectName, previousDeploymentId, previousDeploymentUrl } = record

    if (!previousDeploymentId) {
      console.warn(`No previous deployment for ${projectName} (${deploymentId}) — skipping auto-rollback`)
      await alertRollbackFailed({
        projectName,
        error: 'No previous successful deployment found to roll back to'
      })
      results.push({ deploymentId, status: 'skipped', reason: 'no_previous' })
      continue
    }

    try {
      console.log(`Auto-rolling back ${projectName}: ${deploymentId} → ${previousDeploymentId}`)
      await rollbackDeployment(previousDeploymentId)
      await markRolledBack(deploymentId, previousDeploymentId)
      await alertRollbackComplete({
        projectName,
        rolledBackTo: previousDeploymentId,
        url: previousDeploymentUrl
      })

      console.log(`Auto-rollback complete: ${projectName}`)
      results.push({ deploymentId, status: 'rolled_back', rolledBackTo: previousDeploymentId })

    } catch (err) {
      console.error(`Auto-rollback failed for ${projectName}:`, err)
      await alertRollbackFailed({ projectName, error: err.message })
      results.push({ deploymentId, status: 'failed', error: err.message })
    }
  }

  return res.status(200).json({ ok: true, processed: results.length, results })
}
