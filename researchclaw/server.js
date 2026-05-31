import { createServer } from "node:http";
import { URL } from "node:url";
import { MockModelAdapter } from "./adapters/mock.js";
import { ResearchOrchestrator } from "./engine/orchestrator.js";
import { FileEvidenceStore } from "./evidence/store.js";
import { handleOpenClawPayload } from "./gateway.js";
import { renderIndexPage, renderPanelPage } from "./ui.js";

const host = process.env.RESEARCHCLAW_HOST || "127.0.0.1";
const port = Number(process.env.RESEARCHCLAW_PORT || 8787);
const store = new FileEvidenceStore();
const orchestrator = new ResearchOrchestrator({ store, adapter: new MockModelAdapter() });

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json"
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

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

server.listen(port, host, () => {
  console.log(`ResearchClaw listening on http://${host}:${port}`);
});
