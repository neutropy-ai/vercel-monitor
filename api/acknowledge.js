// api/acknowledge.js
// Luke clicks this link in the WhatsApp message to cancel auto-rollback
// URL: /api/acknowledge?id=[deploymentId]

import { acknowledge, getPending } from '../lib/store.js'
import { alertAcknowledged } from '../lib/ghl.js'

export default async function handler(req, res) {
  const { id } = req.query

  if (!id) {
    return res.status(400).send(html('Missing ID', 'No deployment ID provided.'))
  }

  try {
    const record = await getPending(id)

    if (!record) {
      return res.status(404).send(html(
        'Not found',
        'This rollback request has already been resolved or expired.'
      ))
    }

    if (record.rolledBack) {
      return res.status(200).send(html(
        'Already rolled back',
        `${record.projectName} was already rolled back automatically. Check Vercel for the current state.`
      ))
    }

    if (record.acknowledged) {
      return res.status(200).send(html(
        'Already acknowledged',
        `You already acknowledged this. Auto-rollback for ${record.projectName} is cancelled.`
      ))
    }

    await acknowledge(id)
    await alertAcknowledged({ projectName: record.projectName })

    return res.status(200).send(html(
      'Rollback cancelled',
      `Got it. Auto-rollback for <strong>${record.projectName}</strong> has been cancelled. You have control — fix and redeploy when ready.`
    ))

  } catch (err) {
    console.error('Acknowledge error:', err)
    return res.status(500).send(html('Error', `Something went wrong: ${err.message}`))
  }
}

function html(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Neutropy Monitor</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; background: #09090b; color: #fafafa; }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 12px; }
    p { color: #a1a1aa; line-height: 1.6; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #06b6d4; color: #000; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="badge">Neutropy Monitor</div>
  <h1>${title}</h1>
  <p>${body}</p>
</body>
</html>`
}
