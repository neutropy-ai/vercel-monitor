// api/webhook.js
// Receives Vercel deployment webhook events
// Configure in Vercel Dashboard → Settings → Webhooks
// Point to: https://[your-monitor-url]/api/webhook
// Events to subscribe: deployment.created, deployment.error, deployment.canceled

import crypto from 'crypto'
import { savePending } from '../lib/store.js'
import { getLastGoodDeployment } from '../lib/vercel.js'
import { alertDeploymentFailure } from '../lib/ghl.js'

// Vercel signs webhook payloads — verify to reject spoofed requests
function verifySignature(req, rawBody) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret) return true // skip verification if not configured (dev only)

  const signature = req.headers['x-vercel-signature']
  if (!signature) return false

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )
}

// Map Vercel error types to a human-readable summary
function summariseError(payload) {
  const { readyState, errorCode, errorMessage, errorStep } = payload.deployment || {}

  if (errorMessage) return errorMessage.slice(0, 200)
  if (errorCode) return `Error code: ${errorCode}${errorStep ? ` at ${errorStep}` : ''}`
  if (readyState === 'ERROR') return 'Build or runtime error'
  if (readyState === 'CANCELED') return 'Deployment was cancelled'
  return 'Unknown error'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Read raw body for signature verification
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const rawBody = Buffer.concat(chunks).toString()

  if (!verifySignature(req, rawBody)) {
    console.error('Webhook signature verification failed')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { type, payload: data } = payload

  const projectName = data?.project?.name || ''

  console.log(`Webhook received: ${type}`, {
    project: projectName,
    deployment: data?.deployment?.id,
    state: data?.deployment?.readyState
  })

  // Project allowlist — only alert on watched production projects
  // Set WATCHED_PROJECTS as comma-separated Vercel project names
  // e.g. "funkytown-middleware,slides-two-silk"
  // Leave empty to watch ALL projects (not recommended during active dev)
  const watched = (process.env.WATCHED_PROJECTS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (watched.length && !watched.includes(projectName)) {
    console.log(`Ignoring event for unwatched project: ${projectName}`)
    return res.status(200).json({ ok: true, action: 'ignored', reason: 'not_watched', project: projectName })
  }

  // Only care about failures and errors
  const FAILURE_STATES = ['ERROR', 'CANCELED']
  const FAILURE_EVENTS = ['deployment.error', 'deployment.canceled']

  const isFailed = (
    FAILURE_EVENTS.includes(type) ||
    FAILURE_STATES.includes(data?.deployment?.readyState)
  )

  if (!isFailed) {
    // Successful deploy — nothing to do
    return res.status(200).json({ ok: true, action: 'ignored', type })
  }

  const deploymentId = data?.deployment?.id
  const projectId = data?.project?.id
  const projectName = data?.project?.name || 'Unknown project'
  const url = data?.deployment?.url ? `https://${data.deployment.url}` : null
  const errorSummary = summariseError(data)

  if (!deploymentId || !projectId) {
    console.error('Missing deploymentId or projectId in webhook payload')
    return res.status(400).json({ error: 'Missing deployment or project ID' })
  }

  try {
    // Find the last good deployment to roll back to
    const lastGood = await getLastGoodDeployment(projectId, deploymentId)

    // Save pending rollback record
    await savePending(deploymentId, {
      projectName,
      projectId,
      url,
      errorSummary,
      previousDeploymentId: lastGood?.uid || null,
      previousDeploymentUrl: lastGood?.url ? `https://${lastGood.url}` : null
    })

    // Alert Luke via WhatsApp
    await alertDeploymentFailure({
      deploymentId,
      projectName,
      url,
      errorSummary
    })

    console.log(`Alert sent for failed deployment: ${deploymentId} (${projectName})`)
    return res.status(200).json({ ok: true, action: 'alert_sent', deploymentId })

  } catch (err) {
    console.error('Error processing failed deployment:', err)
    // Still return 200 so Vercel doesn't retry — we log it
    return res.status(200).json({ ok: false, error: err.message })
  }
}
