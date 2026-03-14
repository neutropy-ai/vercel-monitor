// api/rollback.js
// Luke clicks this link in WhatsApp for an immediate rollback
// URL: /api/rollback?id=[deploymentId]

import { getPending, markRolledBack } from '../lib/store.js'
import { rollbackDeployment } from '../lib/vercel.js'
import { alertRollbackComplete, alertRollbackFailed } from '../lib/ghl.js'

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
        `${record.projectName} was already rolled back to a previous deployment.`
      ))
    }

    if (!record.previousDeploymentId) {
      return res.status(200).send(html(
        'No previous deployment',
        `No previous successful deployment found for ${record.projectName}. Roll back manually in the Vercel dashboard.`
      ))
    }

    // Execute rollback
    await rollbackDeployment(record.previousDeploymentId)
    await markRolledBack(id, record.previousDeploymentId)

    // Notify Luke it's done
    await alertRollbackComplete({
      projectName: record.projectName,
      rolledBackTo: record.previousDeploymentId,
      url: record.previousDeploymentUrl
    })

    return res.status(200).send(html(
      'Rolled back',
      `<strong>${record.projectName}</strong> has been rolled back to the previous deployment.<br><br>
      Live URL: <a href="${record.previousDeploymentUrl || '#'}" style="color:#06b6d4">${record.previousDeploymentUrl || 'check Vercel'}</a>`
    ))

  } catch (err) {
    console.error('Rollback error:', err)

    // Try to alert Luke that rollback failed
    try {
      const record = await getPending(id)
      if (record) {
        await alertRollbackFailed({ projectName: record.projectName, error: err.message })
      }
    } catch (alertErr) {
      console.error('Failed to send rollback failure alert:', alertErr)
    }

    return res.status(500).send(html(
      'Rollback failed',
      `Could not complete rollback: ${err.message}<br><br>
      Go to the <a href="https://vercel.com/neutropy-ai" style="color:#06b6d4">Vercel dashboard</a> and roll back manually.`
    ))
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
    a { color: #06b6d4; }
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
