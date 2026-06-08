import type { Artifact, EvidencePreview, HealthStatus, ProjectState, ProjectSummary } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const body = await getJson<{ ok: boolean; projects: ProjectSummary[] }>("/projects");
  return body.projects ?? [];
}

export async function fetchHealth(): Promise<HealthStatus> {
  return getJson<HealthStatus>("/health");
}

export async function fetchState(projectId: string): Promise<ProjectState> {
  const body = await getJson<{ ok: boolean; state: ProjectState }>(`/projects/${projectId}/state`);
  return body.state;
}

export async function fetchArtifact(projectId: string, ref: string): Promise<Artifact> {
  const body = await getJson<{ ok: boolean; artifact: Artifact }>(
    `/projects/${projectId}/artifact?ref=${encodeURIComponent(ref)}`
  );
  return body.artifact;
}

// Live evidence map (claimEvidenceGate over current artifacts). Read-only.
export async function fetchEvidence(projectId: string): Promise<EvidencePreview> {
  return getJson<EvidencePreview>(`/projects/${projectId}/evidence`);
}

// --- mutations -------------------------------------------------------------
// All of these return after the POST resolves; the panel does NOT assemble
// state locally — it waits for the SSE `snapshot` the engine broadcasts.

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json: { ok?: boolean; error?: string } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* empty/non-JSON body */
  }
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `POST ${path} failed: ${res.status}`);
  }
  return json as T;
}

export function approveContract(
  projectId: string,
  args: { artifactId?: string; artifactRef?: string }
): Promise<unknown> {
  return postJson(`/projects/${projectId}/approve`, {
    target: "contract",
    artifact_id: args.artifactId,
    artifact_ref: args.artifactRef
  });
}

export function reviseContract(
  projectId: string,
  args: { artifactId?: string; feedback: string }
): Promise<unknown> {
  return postJson(`/projects/${projectId}/revise`, {
    target: "contract",
    artifact_id: args.artifactId,
    feedback: args.feedback
  });
}

export function startProject(projectId: string, researchDirection: string): Promise<unknown> {
  return postJson(`/projects/${projectId}/start`, { research_direction: researchDirection });
}

// consult 一问一答 (M3). The backend acks fast and runs the turn in the
// background; the reply streams over SSE. An unavailable/over-budget backend
// returns { ok:false, error } — an expected honest state, NOT thrown (so we use
// fetch directly rather than postJson, which throws on ok:false).
export async function sendConsult(
  projectId: string,
  message: string
): Promise<{ ok: boolean; running?: boolean; error?: { code: string; message: string } }> {
  const res = await fetch(`/projects/${projectId}/consult`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ message })
  });
  try {
    return (await res.json()) as { ok: boolean; running?: boolean; error?: { code: string; message: string } };
  } catch {
    return { ok: false, error: { code: "bad_response", message: `consult failed: ${res.status}` } };
  }
}

export function promoteConsult(
  projectId: string,
  rawLogRef: string,
  note?: string
): Promise<{ ok: boolean; artifact_ref: string }> {
  return postJson(`/projects/${projectId}/consult/promote`, { raw_log_ref: rawLogRef, note });
}

export function advancePhase(projectId: string): Promise<unknown> {
  return postJson(`/projects/${projectId}/advance`);
}

export function recoverProject(projectId: string, args: { to?: string }): Promise<unknown> {
  return postJson(`/projects/${projectId}/recover`, { to: args.to });
}

// --- project management (archive = soft delete; delete = permanent) ---------

export function archiveProject(projectId: string): Promise<unknown> {
  return postJson(`/projects/${projectId}/archive`);
}

export function unarchiveProject(projectId: string): Promise<unknown> {
  return postJson(`/projects/${projectId}/unarchive`);
}

export function deleteProject(projectId: string): Promise<unknown> {
  return postJson(`/projects/${projectId}/delete`);
}
