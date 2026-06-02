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
