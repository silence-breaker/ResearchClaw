import type { Artifact, ProjectState, ProjectSummary } from "./types";

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

export function advancePhase(projectId: string): Promise<unknown> {
  return postJson(`/projects/${projectId}/advance`);
}

export function recoverProject(projectId: string, args: { to?: string }): Promise<unknown> {
  return postJson(`/projects/${projectId}/recover`, { to: args.to });
}
