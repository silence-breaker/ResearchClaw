import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

export function slugify(value, fallback = "demo_001") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function projectIdFromPayload(payload) {
  const raw =
    payload?.projectName ||
    (payload?.projectPath ? basename(payload.projectPath) : undefined) ||
    payload?.context?.projectPath ||
    payload?.sessionId ||
    "demo_001";
  const slug = slugify(raw);
  return slug.startsWith("proj_") ? slug : `proj_${slug}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readJsonUrl(url) {
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

export function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|authorization|token|secret|password/i.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactSecrets(item);
    }
  }
  return out;
}

export function publicStateSummary(state) {
  return {
    project_id: state.project_id,
    phase: state.phase,
    current: state.current,
    pending_human_actions: state.pending_human_actions,
    latest_signal_id: state.latest_signal_id,
    updated_at: state.updated_at
  };
}
