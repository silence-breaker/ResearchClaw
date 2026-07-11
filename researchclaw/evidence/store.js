import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createInitialState } from "../engine/state.js";
import { makeId, nowIso, redactSecrets, slugify } from "../util.js";

export class FileEvidenceStore {
  constructor({ rootDir = resolve(process.cwd(), ".researchclaw") } = {}) {
    this.rootDir = rootDir;
  }

  projectDir(projectId) {
    return join(this.rootDir, "projects", projectId);
  }

  ensureProject(projectId) {
    const base = this.projectDir(projectId);
    for (const dir of [
      base,
      join(base, "contracts"),
      join(base, "raw_payloads"),
      join(base, "artifacts"),
      join(base, "artifacts", "intake"),
      join(base, "artifacts", "contract_draft"),
      join(base, "artifacts", "contract_review"),
      join(base, "artifacts", "literature_scouting"),
      join(base, "artifacts", "baseline_selection"),
      join(base, "artifacts", "baseline_reproduction_checklist"),
      join(base, "artifacts", "idea_generation"),
      join(base, "artifacts", "idea_review"),
      join(base, "artifacts", "summary"),
      join(base, "artifacts", "tool_results"),
      join(base, "logs")
    ]) {
      mkdirSync(dir, { recursive: true });
    }
    const statePath = join(base, "state.json");
    if (!existsSync(statePath)) {
      this.writeState(createInitialState(projectId));
    }
  }

  readState(projectId) {
    this.ensureProject(projectId);
    return JSON.parse(readFileSync(join(this.projectDir(projectId), "state.json"), "utf8"));
  }

  writeState(state) {
    this.ensureProjectDirsOnly(state.project_id);
    writeFileSync(join(this.projectDir(state.project_id), "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  }

  ensureProjectDirsOnly(projectId) {
    const base = this.projectDir(projectId);
    mkdirSync(base, { recursive: true });
  }

  saveRawPayload(projectId, event, payload) {
    this.ensureProject(projectId);
    const safeEvent = slugify(event, "event");
    const safeTimestamp = nowIso().replace(/[:.]/g, "-");
    const fileName = `${safeTimestamp}-${safeEvent}-${makeId("raw").slice(-8)}.json`;
    const ref = `raw_payloads/${fileName}`;
    writeFileSync(
      join(this.projectDir(projectId), ref),
      `${JSON.stringify(redactSecrets(payload), null, 2)}\n`
    );
    return ref;
  }

  appendArtifact(artifact) {
    this.ensureProject(artifact.project_id);
    const phaseDir = join(this.projectDir(artifact.project_id), "artifacts", artifact.phase);
    mkdirSync(phaseDir, { recursive: true });
    const ref = `artifacts/${artifact.phase}/${artifact.artifact_id}.json`;
    writeFileSync(join(this.projectDir(artifact.project_id), ref), `${JSON.stringify(artifact, null, 2)}\n`);
    if (artifact.type === "contract") {
      const version = artifact.content?.version ?? "unknown";
      const contractRef = `contracts/contract.v${version}.${artifact.status}.json`;
      writeFileSync(join(this.projectDir(artifact.project_id), contractRef), `${JSON.stringify(artifact, null, 2)}\n`);
    }
    return ref;
  }

  readArtifact(projectId, ref) {
    this.ensureProject(projectId);
    return JSON.parse(readFileSync(join(this.projectDir(projectId), ref), "utf8"));
  }

  listProjectIds() {
    const projectsDir = join(this.rootDir, "projects");
    if (!existsSync(projectsDir)) {
      return [];
    }
    return readdirSync(projectsDir)
      .filter((name) => {
        try {
          return statSync(join(projectsDir, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  }

  listProjectSummaries() {
    return this.listProjectIds().map((projectId) => {
      const state = this.readState(projectId);
      return {
        project_id: projectId,
        phase: state.phase,
        updated_at: state.updated_at,
        pending_human_actions: state.pending_human_actions,
        archived: Boolean(state.archived)
      };
    });
  }

  // --- project management (meta ops; do NOT touch the research state machine) ---

  archiveProject(projectId) {
    const state = this.readState(projectId);
    state.archived = true;
    state.archived_at = nowIso();
    this.writeState(state);
  }

  unarchiveProject(projectId) {
    const state = this.readState(projectId);
    delete state.archived;
    delete state.archived_at;
    this.writeState(state);
  }

  // Permanently removes a project directory. Guards against ids that would
  // escape the projects/ root (path traversal).
  deleteProject(projectId) {
    // project ids are single slugified segments — anything with a path separator
    // or dot-segment is rejected before it can touch the filesystem.
    if (!projectId || projectId.includes("/") || projectId.includes("\\") || projectId === "." || projectId === "..") {
      throw new Error(`invalid project id: ${projectId}`);
    }
    const projectsRoot = resolve(this.rootDir, "projects");
    const dir = resolve(projectsRoot, projectId);
    if (dir !== join(projectsRoot, projectId) || !dir.startsWith(projectsRoot + sep)) {
      throw new Error(`invalid project id: ${projectId}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
