import { createHash } from "node:crypto";
import { definePluginEntry } from "openclaw/plugin-sdk/core";

const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 5000;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function readUrl(value, fallback) {
  const raw = trimTrailingSlash(value);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function readTimeoutMs(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 1000), 30000)
    : DEFAULT_TIMEOUT_MS;
}

function resolveConfig(rawConfig) {
  const raw = asRecord(rawConfig);
  const envServerUrl = process.env.RESEARCHCLAW_URL || process.env.RESEARCHCLAW_BASE_URL;
  const serverUrl = readUrl(raw.serverUrl, readUrl(envServerUrl, DEFAULT_SERVER_URL));
  const publicUrl = readUrl(raw.publicUrl, readUrl(process.env.RESEARCHCLAW_PUBLIC_URL, serverUrl));
  return {
    serverUrl,
    publicUrl,
    requestTimeoutMs: readTimeoutMs(raw.requestTimeoutMs)
  };
}

function stableProjectId(ctx) {
  const sessionKey = String(ctx.sessionKey || "").trim();
  const sessionId = String(ctx.sessionId || "").trim();
  if (!sessionKey || sessionKey === "main" || sessionKey === "global" || !sessionId) {
    return "proj_openclaw";
  }
  const identity = [
    ctx.sessionKey,
    ctx.sessionId,
    ctx.channel,
    ctx.accountId,
    ctx.from,
    ctx.messageThreadId,
    ctx.threadParentId
  ].filter(Boolean).join("|") || "openclaw";
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `proj_openclaw_${hash}`;
}

function parseCommandArgs(args) {
  const trimmed = String(args || "").trim();
  if (!trimmed) {
    return { action: "open" };
  }
  const [first, ...rest] = trimmed.split(/\s+/);
  const keyword = first.toLowerCase();
  if (keyword === "help" || keyword === "-h" || keyword === "--help") {
    return { action: "help" };
  }
  if (keyword === "status") {
    return { action: "status" };
  }
  if (keyword === "start" || keyword === "open" || keyword === "launch") {
    return {
      action: "start",
      researchDirection: rest.join(" ").trim()
    };
  }
  return {
    action: "start",
    researchDirection: trimmed
  };
}

function shouldBootstrap(state) {
  return state?.phase === "idle"
    && !state.current?.intake_artifact_ref
    && !(Array.isArray(state.phase_history) && state.phase_history.length > 0);
}

function panelUrl(publicUrl, projectId) {
  return `${publicUrl}/panel/${encodeURIComponent(projectId)}`;
}

function summarizePendingActions(state) {
  const pending = Array.isArray(state?.pending_human_actions) ? state.pending_human_actions : [];
  if (!pending.length) {
    return "none";
  }
  return pending
    .map((action) => action.label || action.description || action.type)
    .filter(Boolean)
    .join(", ");
}

function formatStatus({ title, projectId, state, url }) {
  return [
    title,
    `- Project: ${projectId}`,
    `- Phase: ${state?.phase || "unknown"}`,
    `- Next action: ${summarizePendingActions(state)}`,
    `- Panel: ${url}`
  ].join("\n");
}

function helpText(config) {
  return [
    "Usage:",
    "- /researchclaw",
    "- /researchclaw <research direction>",
    "- /researchclaw status",
    "",
    "Behavior:",
    "- No args: open or create the ResearchClaw project for this OpenClaw session.",
    "- With a research direction: restart that session project and draft the contract.",
    "",
    `ResearchClaw server: ${config.serverUrl}`
  ].join("\n");
}

async function requestJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || data.ok === false) {
      const detail = data.error || (Array.isArray(data.errors) ? data.errors.join("; ") : "");
      throw new Error(detail || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function serverUnavailableText(config, error) {
  return [
    `ResearchClaw is not reachable at ${config.serverUrl}.`,
    `Reason: ${error.message}`,
    "",
    "Start the demo service from the repository with:",
    "npm run dev",
    "",
    "Then run /researchclaw again."
  ].join("\n");
}

async function readState(config, projectId) {
  const data = await requestJson(
    `${config.serverUrl}/projects/${encodeURIComponent(projectId)}/state`,
    {},
    config.requestTimeoutMs
  );
  return data.state;
}

async function startProject(config, projectId, researchDirection) {
  const body = researchDirection ? { research_direction: researchDirection } : {};
  const data = await requestJson(
    `${config.serverUrl}/projects/${encodeURIComponent(projectId)}/start`,
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    config.requestTimeoutMs
  );
  return data.state || data;
}

export default definePluginEntry({
  id: "researchclaw",
  name: "ResearchClaw",
  description: "Start or resume the local ResearchClaw workflow from OpenClaw chat.",
  register(api) {
    api.registerCommand({
      name: "researchclaw",
      description: "Start or resume the ResearchClaw workflow.",
      acceptsArgs: true,
      requireAuth: false,
      handler: async (ctx) => {
        const config = resolveConfig(api.pluginConfig);
        const parsed = parseCommandArgs(ctx.args);
        const projectId = stableProjectId(ctx);
        const url = panelUrl(config.publicUrl, projectId);

        if (parsed.action === "help") {
          return { text: helpText(config) };
        }

        try {
          if (parsed.action === "status") {
            const state = await readState(config, projectId);
            return { text: formatStatus({ title: "ResearchClaw status", projectId, state, url }) };
          }

          const existing = await readState(config, projectId);
          const state = parsed.researchDirection || shouldBootstrap(existing)
            ? await startProject(config, projectId, parsed.researchDirection)
            : existing;

          return {
            text: formatStatus({
              title: parsed.researchDirection ? "ResearchClaw started" : "ResearchClaw ready",
              projectId,
              state,
              url
            })
          };
        } catch (error) {
          return { text: serverUnavailableText(config, error) };
        }
      }
    });
  }
});
