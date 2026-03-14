// lib/vercel.js
// Vercel REST API client
// Docs: https://vercel.com/docs/rest-api

const VERCEL_API = 'https://api.vercel.com'
const TOKEN = process.env.VERCEL_API_TOKEN
const TEAM_ID = process.env.VERCEL_TEAM_ID // optional, for team accounts

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
}

function teamParam() {
  return TEAM_ID ? `?teamId=${TEAM_ID}` : ''
}

/**
 * Get the last N deployments for a project
 * Returns deployments sorted by createdAt desc
 */
export async function getDeployments(projectId, limit = 10) {
  const params = new URLSearchParams({ projectId, limit, state: 'READY' })
  if (TEAM_ID) params.set('teamId', TEAM_ID)

  const res = await fetch(`${VERCEL_API}/v6/deployments?${params}`, {
    headers: headers()
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Vercel getDeployments failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.deployments || []
}

/**
 * Get the last successful deployment before a given deployment ID
 * This is what we roll back to
 */
export async function getLastGoodDeployment(projectId, failedDeploymentId) {
  const deployments = await getDeployments(projectId, 20)

  // Find the failed one and get the one before it that was READY
  let foundFailed = false
  for (const d of deployments) {
    if (d.uid === failedDeploymentId) {
      foundFailed = true
      continue
    }
    if (foundFailed && d.readyState === 'READY') {
      return d
    }
  }

  // If not found after failed, just return the most recent READY one
  return deployments.find(d => d.uid !== failedDeploymentId && d.readyState === 'READY') || null
}

/**
 * Promote a previous deployment to production (the rollback)
 */
export async function rollbackDeployment(deploymentId) {
  const params = teamParam()
  const res = await fetch(
    `${VERCEL_API}/v10/deployments/${deploymentId}/promote${params}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: 'production' })
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Vercel rollback failed: ${res.status} ${err}`)
  }

  return await res.json()
}

/**
 * Get a single deployment's details
 */
export async function getDeployment(deploymentId) {
  const params = teamParam()
  const res = await fetch(
    `${VERCEL_API}/v13/deployments/${deploymentId}${params}`,
    { headers: headers() }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Vercel getDeployment failed: ${res.status} ${err}`)
  }

  return await res.json()
}
