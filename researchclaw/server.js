import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { MockModelAdapter } from "./adapters/mock.js";
import { EventBus } from "./engine/events.js";
import { ResearchOrchestrator } from "./engine/orchestrator.js";
import { FileEvidenceStore } from "./evidence/store.js";
import { handleOpenClawPayload } from "./gateway.js";
import { renderIndexPage, renderPanelPage } from "./ui.js";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json"
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

function serveStaticFile(res, filePath) {
  res.writeHead(200, {
    "Content-Type": contentTypeByExt[extname(filePath)] || "application/octet-stream"
  });
  res.end(readFileSync(filePath));
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

export function createResearchServer({ store, orchestrator, eventBus = null, webDistDir }) {
  const distDir = webDistDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "web", "dist");
  const distIndex = join(distDir, "index.html");
  return createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/") {
      sendHtml(res, 200, renderIndexPage(store.listProjectSummaries()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/panel") {
      const projects = store.listProjectIds();
      const latest = projects.at(-1) || "proj_openclaw";
      sendHtml(res, 200, renderPanelPage(latest));
      return;
    }

    const panelMatch = url.pathname.match(/^\/panel\/([^/]+)$/);
    if (req.method === "GET" && panelMatch) {
      sendHtml(res, 200, renderPanelPage(panelMatch[1]));
      return;
    }

    if (req.method === "POST" && url.pathname === "/openclaw/hooks") {
      const payload = await readJsonBody(req);
      const result = await handleOpenClawPayload({ payload, store, orchestrator });
      sendJson(res, result.status, result.body);
      return;
    }

    if (req.method === "GET" && url.pathname === "/projects") {
      sendJson(res, 200, {
        ok: true,
        projects: store.listProjectSummaries()
      });
      return;
    }

    const stateMatch = url.pathname.match(/^\/projects\/([^/]+)\/state$/);
    if (req.method === "GET" && stateMatch) {
      const state = store.readState(stateMatch[1]);
      sendJson(res, 200, {
        ok: true,
        state
      });
      return;
    }

    const evidenceMatch = url.pathname.match(/^\/projects\/([^/]+)\/evidence$/);
    if (req.method === "GET" && evidenceMatch) {
      const result = await orchestrator.previewEvidence(evidenceMatch[1]);
      sendJson(res, 200, result);
      return;
    }

    const artifactMatch = url.pathname.match(/^\/projects\/([^/]+)\/artifact$/);
    if (req.method === "GET" && artifactMatch) {
      const ref = url.searchParams.get("ref");
      if (!ref) {
        sendJson(res, 400, {
          ok: false,
          error: "ref is required"
        });
        return;
      }
      const artifact = store.readArtifact(artifactMatch[1], ref);
      sendJson(res, 200, {
        ok: true,
        artifact
      });
      return;
    }

    const startMatch = url.pathname.match(/^\/projects\/([^/]+)\/start$/);
    if (req.method === "POST" && startMatch) {
      const body = await readJsonBody(req);
      const researchDirection = body.research_direction || body.userText || body.topic;
      const result = await orchestrator.startFromText(startMatch[1], researchDirection, {
        source: "dashboard"
      });
      sendJson(res, 200, result);
      return;
    }

    const advanceMatch = url.pathname.match(/^\/projects\/([^/]+)\/advance$/);
    if (req.method === "POST" && advanceMatch) {
      const result = await orchestrator.advance(advanceMatch[1]);
      sendJson(res, 200, result);
      return;
    }

    const approveMatch = url.pathname.match(/^\/projects\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const body = await readJsonBody(req);
      const result = await orchestrator.approve(approveMatch[1], body);
      sendJson(res, 200, result);
      return;
    }

    const reviseMatch = url.pathname.match(/^\/projects\/([^/]+)\/revise$/);
    if (req.method === "POST" && reviseMatch) {
      const body = await readJsonBody(req);
      const result = await orchestrator.revise(reviseMatch[1], body);
      sendJson(res, 200, result);
      return;
    }

    const recoverMatch = url.pathname.match(/^\/projects\/([^/]+)\/recover$/);
    if (req.method === "POST" && recoverMatch) {
      const body = await readJsonBody(req);
      const result = await orchestrator.recover(recoverMatch[1], body);
      sendJson(res, 200, result);
      return;
    }

    const archiveMatch = url.pathname.match(/^\/projects\/([^/]+)\/archive$/);
    if (req.method === "POST" && archiveMatch) {
      store.archiveProject(archiveMatch[1]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const unarchiveMatch = url.pathname.match(/^\/projects\/([^/]+)\/unarchive$/);
    if (req.method === "POST" && unarchiveMatch) {
      store.unarchiveProject(unarchiveMatch[1]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const deleteMatch = url.pathname.match(/^\/projects\/([^/]+)\/delete$/);
    if (req.method === "POST" && deleteMatch) {
      store.deleteProject(deleteMatch[1]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const streamMatch = url.pathname.match(/^\/projects\/([^/]+)\/stream$/);
    if (req.method === "GET" && streamMatch) {
      const projectId = streamMatch[1];
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      const writeEvent = (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      };
      // first frame: the current full state, so a fresh client renders immediately
      writeEvent({ type: "snapshot", data: store.readState(projectId) });
      const unsubscribe = eventBus
        ? eventBus.subscribe(projectId, writeEvent)
        : () => {};
      const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 15000);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.on("close", cleanup);
      res.on("close", cleanup);
      return;
    }

    // New React SPA, served under /app (legacy ui.js keeps / and /panel).
    // Real files are served directly; unknown paths fall back to index.html
    // so client-side routing (React Router basename=/app) works on refresh.
    if (req.method === "GET" && (url.pathname === "/app" || url.pathname.startsWith("/app/")) && existsSync(distIndex)) {
      const rel = url.pathname.replace(/^\/app\/?/, "");
      const candidate = rel ? normalize(join(distDir, rel)) : "";
      if (candidate && candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
        serveStaticFile(res, candidate);
      } else {
        serveStaticFile(res, distIndex);
      }
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: "not_found"
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
  });
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const host = process.env.RESEARCHCLAW_HOST || "127.0.0.1";
  const port = Number(process.env.RESEARCHCLAW_PORT || 8787);
  const store = new FileEvidenceStore();
  const eventBus = new EventBus();
  const orchestrator = new ResearchOrchestrator({ store, adapter: new MockModelAdapter(), eventBus });
  const server = createResearchServer({ store, orchestrator, eventBus });
  server.listen(port, host, () => {
    console.log(`ResearchClaw listening on http://${host}:${port}`);
  });
}
