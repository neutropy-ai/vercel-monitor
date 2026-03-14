// lib/ghl.js
// GoHighLevel WhatsApp message sender
// Uses GHL's SMS/WhatsApp API to message Luke's number

const GHL_API = 'https://services.leadconnectorhq.com'
const GHL_TOKEN = process.env.GHL_API_TOKEN
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID
const LUKE_PHONE = process.env.LUKE_PHONE // e.g. +353857746900
const MONITOR_BASE_URL = process.env.MONITOR_BASE_URL // e.g. https://neutropy-monitor.vercel.app

/**
 * Send a WhatsApp message to Luke via GHL
 */
async function sendWhatsApp(message) {
  const res = await fetch(`${GHL_API}/conversations/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      'Content-Type': 'application/json',
      Version: '2021-04-15'
    },
    body: JSON.stringify({
      type: 'WhatsApp',
      locationId: GHL_LOCATION_ID,
      contactPhone: LUKE_PHONE,
      message
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GHL WhatsApp failed: ${res.status} ${err}`)
  }

  return await res.json()
}

/**
 * Alert Luke of a deployment failure
 * Includes acknowledge and immediate rollback links
 */
export async function alertDeploymentFailure({ deploymentId, projectName, url, errorSummary }) {
  const ackUrl = `${MONITOR_BASE_URL}/api/acknowledge?id=${deploymentId}`
  const rollbackUrl = `${MONITOR_BASE_URL}/api/rollback?id=${deploymentId}`

  const message = [
    `*Neutropy Deploy Alert*`,
    ``,
    `Project: *${projectName}*`,
    `Status: Failed`,
    `URL: ${url || 'unknown'}`,
    errorSummary ? `Error: ${errorSummary}` : '',
    ``,
    `Auto-rollback in *5 minutes* unless you respond.`,
    ``,
    `I'm on it (cancel rollback):`,
    ackUrl,
    ``,
    `Rollback now:`,
    rollbackUrl
  ].filter(Boolean).join('\n')

  return await sendWhatsApp(message)
}

/**
 * Confirm to Luke that a rollback completed successfully
 */
export async function alertRollbackComplete({ projectName, rolledBackTo, url }) {
  const message = [
    `*Neutropy Auto-Rollback Complete*`,
    ``,
    `Project: *${projectName}*`,
    `Rolled back to: ${rolledBackTo}`,
    `Live URL: ${url || 'unknown'}`,
    ``,
    `Site is back up. Check the failed deploy logs in Vercel dashboard.`
  ].join('\n')

  return await sendWhatsApp(message)
}

/**
 * Alert Luke that rollback failed (so they know to act manually)
 */
export async function alertRollbackFailed({ projectName, error }) {
  const message = [
    `*Neutropy Rollback Failed*`,
    ``,
    `Project: *${projectName}*`,
    `Could not auto-rollback: ${error}`,
    ``,
    `Action needed: go to Vercel dashboard and rollback manually.`,
    `https://vercel.com/neutropy-ai`
  ].join('\n')

  return await sendWhatsApp(message)
}

/**
 * Confirm to Luke that his acknowledgement was received
 */
export async function alertAcknowledged({ projectName }) {
  const message = [
    `*Rollback cancelled*`,
    ``,
    `Got it. Auto-rollback for *${projectName}* cancelled.`,
    `You have control. Fix and redeploy when ready.`
  ].join('\n')

  return await sendWhatsApp(message)
}
