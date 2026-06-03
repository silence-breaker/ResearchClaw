function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizeLanguage(value) {
  return String(value ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

const phaseOrder = [
  "intake",
  "contract_draft",
  "contract_review",
  "literature_scouting",
  "baseline_selection",
  "baseline_reproduction_checklist",
  "idea_generation",
  "idea_review",
  "summary"
];

const LANG_STORAGE_KEY = "researchclaw.ui.lang";
const SUPPORTED_LANGUAGES = ["en", "zh"];

const UI_TEXT = {
  en: {
    indexPageTitle: "ResearchClaw Projects",
    indexHeading: "Projects",
    openProject: "Open Demo Project",
    tableProject: "Project",
    tablePhase: "Phase",
    tableUpdated: "Updated",
    noProjectsYet: "No projects yet.",
    panelPageTitle: "ResearchClaw {projectId}",
    panelEyebrow: "ResearchClaw workflow",
    workflowHeading: "Workflow",
    currentActionHeading: "Current Action",
    artifactsHeading: "Artifacts",
    rawStateHeading: "Raw State",
    refresh: "Refresh",
    loading: "Loading...",
    phaseNames: {
      intake: "Intake",
      contract_draft: "Contract draft",
      contract_review: "Contract review",
      literature_scouting: "Literature scouting",
      baseline_selection: "Baseline selection",
      baseline_reproduction_checklist: "Reproduction checklist",
      idea_generation: "Idea generation",
      idea_review: "Idea review",
      summary: "Summary",
      idle: "Idle",
      blocked: "Blocked"
    },
    statusNames: {
      active: "Active",
      done: "Done",
      pending: "Pending"
    },
    phaseButtons: {
      literature_scouting: "Run Literature Scouting",
      baseline_selection: "Run Baseline Selection",
      baseline_reproduction_checklist: "Run Reproduction Checklist",
      idea_generation: "Run Idea Generation",
      idea_review: "Run Idea Review",
      summary: "Write Summary"
    },
    action: {
      researchDirection: "Research direction",
      researchDirectionPlaceholder: "Example: Study lightweight reranking for domain-specific vision-language retrieval.",
      draftResearchContract: "Draft Research Contract",
      contractReviewPrompt: "Review the drafted contract before literature scouting starts.",
      approveContract: "Approve Contract",
      reviseContract: "Revise Contract",
      revisionNotePlaceholder: "Revision note for the contract",
      runStepInfo: "This step will run one workflow and write one artifact to the evidence store.",
      blocked: "Workflow is blocked. Inspect pending actions and revise the source artifact.",
      noRunnableAction: "No runnable action. Review next human actions below.",
      noArtifactsYet: "No artifacts yet.",
      noContentLoaded: "No content loaded."
    },
    pending: {
      provideResearchDirection: "Enter research direction",
      approveOrReviseContract: "Approve or revise contract",
      humanFeedbackReceived: "Human feedback recorded",
      reviseRequired: "Revise {phase}: {errors}"
    },
    artifactLabels: {
      contract: "Contract",
      literature: "Literature",
      baseline: "Baseline",
      checklist: "Checklist",
      ideas: "Ideas",
      review: "Review",
      summary: "Summary"
    },
    artifact: {
      topic: "Topic",
      hypothesis: "Hypothesis",
      metrics: "Metrics",
      recommendedIdea: "Recommended idea:",
      none: "none",
      summaryNextActions: "Next human actions"
    }
  },
  zh: {
    indexPageTitle: "ResearchClaw 项目",
    indexHeading: "项目",
    openProject: "打开演示项目",
    tableProject: "项目",
    tablePhase: "阶段",
    tableUpdated: "更新时间",
    noProjectsYet: "暂无项目。",
    panelPageTitle: "ResearchClaw {projectId}",
    panelEyebrow: "ResearchClaw 工作流",
    workflowHeading: "工作流",
    currentActionHeading: "当前操作",
    artifactsHeading: "产物",
    rawStateHeading: "原始状态",
    refresh: "刷新",
    loading: "加载中...",
    phaseNames: {
      intake: "录入",
      contract_draft: "契约草稿",
      contract_review: "契约审阅",
      literature_scouting: "文献侦察",
      baseline_selection: "基线选择",
      baseline_reproduction_checklist: "复现清单",
      idea_generation: "想法生成",
      idea_review: "想法评审",
      summary: "总结",
      idle: "空闲",
      blocked: "阻塞"
    },
    statusNames: {
      active: "进行中",
      done: "已完成",
      pending: "待开始"
    },
    phaseButtons: {
      literature_scouting: "运行文献侦察",
      baseline_selection: "运行基线选择",
      baseline_reproduction_checklist: "运行复现清单",
      idea_generation: "运行想法生成",
      idea_review: "运行想法评审",
      summary: "撰写总结"
    },
    action: {
      researchDirection: "研究方向",
      researchDirectionPlaceholder: "例如：研究领域内轻量重排序在特定视觉-语言检索中的效果。",
      draftResearchContract: "起草研究契约",
      contractReviewPrompt: "在进入文献侦察前先审阅草稿契约。",
      approveContract: "批准契约",
      reviseContract: "修改契约",
      revisionNotePlaceholder: "填写契约修改说明",
      runStepInfo: "此步骤会运行一个 workflow，并向 evidence store 写入一个产物。",
      blocked: "工作流已阻塞。请检查待办并修订源产物。",
      noRunnableAction: "当前没有可运行操作。请查看下方的下一步人工动作。",
      noArtifactsYet: "暂无产物。",
      noContentLoaded: "未加载内容。"
    },
    pending: {
      provideResearchDirection: "输入研究方向",
      approveOrReviseContract: "批准或修改契约",
      humanFeedbackReceived: "已记录人工反馈",
      reviseRequired: "需要修订 {phase}：{errors}"
    },
    artifactLabels: {
      contract: "契约",
      literature: "文献",
      baseline: "基线",
      checklist: "清单",
      ideas: "想法",
      review: "评审",
      summary: "总结"
    },
    artifact: {
      topic: "主题",
      hypothesis: "假设",
      metrics: "指标",
      recommendedIdea: "推荐想法：",
      none: "无",
      summaryNextActions: "后续人工动作"
    }
  }
};

function renderLanguageSwitcher() {
  return `
    <div class="lang-switch" role="group" aria-label="Language switch">
      <button class="lang-switch-btn" type="button" data-lang-option="zh">中文</button>
      <button class="lang-switch-btn" type="button" data-lang-option="en">EN</button>
    </div>`;
}

function buildRuntimeScript({ page, projectId }) {
  return `<script>
    (() => {
      const messages = ${escapeScriptJson(UI_TEXT)};
      const storageKey = ${JSON.stringify(LANG_STORAGE_KEY)};
      const pageKind = ${JSON.stringify(page)};
      const projectIdValue = ${JSON.stringify(projectId)};
      const phaseOrder = ${JSON.stringify(phaseOrder)};
      let currentLang = resolveInitialLanguage();
      let currentState = null;

      function normalizeLanguage(value) {
        return String(value || "").toLowerCase().startsWith("zh") ? "zh" : "en";
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function resolveInitialLanguage() {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored === "en" || stored === "zh") {
            return stored;
          }
        } catch (error) {}
        return navigator.language && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
      }

      function pack(lang = currentLang) {
        return messages[normalizeLanguage(lang)] || messages.en;
      }

      function lookup(path, lang = currentLang) {
        const source = pack(lang);
        const keys = path.split(".");
        let value = source;
        for (const key of keys) {
          if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key)) {
            value = undefined;
            break;
          }
          value = value[key];
        }
        if (value !== undefined) {
          return value;
        }
        let fallback = messages.en;
        for (const key of keys) {
          if (!fallback || typeof fallback !== "object" || !Object.prototype.hasOwnProperty.call(fallback, key)) {
            return undefined;
          }
          fallback = fallback[key];
        }
        return fallback;
      }

      function format(template, values = {}) {
        return String(template || "").replace(/\{([^}]+)\}/g, (_, key) => (
          Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : ""
        ));
      }

      function text(path) {
        const value = lookup(path);
        return value === undefined || value === null ? "" : String(value);
      }

      function updateLanguageButtons() {
        document.querySelectorAll("[data-lang-option]").forEach((button) => {
          const lang = normalizeLanguage(button.getAttribute("data-lang-option"));
          button.setAttribute("aria-pressed", lang === currentLang ? "true" : "false");
        });
      }

      function updateStaticText() {
        document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
        document.documentElement.dataset.uiLang = currentLang;
        if (document.body) {
          document.body.dataset.uiLang = currentLang;
        }
        document.querySelectorAll("[data-i18n]").forEach((node) => {
          const key = node.getAttribute("data-i18n");
          const value = lookup(key);
          if (value !== undefined) {
            node.textContent = String(value);
          }
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
          const key = node.getAttribute("data-i18n-placeholder");
          const value = lookup(key);
          if (value !== undefined) {
            node.setAttribute("placeholder", String(value));
          }
        });
        document.querySelectorAll("[data-i18n-title]").forEach((node) => {
          const key = node.getAttribute("data-i18n-title");
          const value = lookup(key);
          if (value !== undefined) {
            node.setAttribute("title", String(value));
          }
        });
        updateLanguageButtons();
        document.title = pageKind === "panel"
          ? format(text("panelPageTitle"), { projectId: projectIdValue })
          : text("indexPageTitle");
      }

      function setLanguage(nextLang, persist = true) {
        currentLang = normalizeLanguage(nextLang);
        if (persist !== false) {
          try {
            localStorage.setItem(storageKey, currentLang);
          } catch (error) {}
        }
        updateStaticText();
        if (pageKind === "panel") {
          if (currentState) {
            renderState(currentState);
            void renderArtifacts(currentState);
          } else {
            setLoadingPlaceholders();
          }
        }
      }

      function setLoadingPlaceholders() {
        const phasePill = document.getElementById("phase-pill");
        if (phasePill) {
          phasePill.textContent = text("loading");
        }
        const actions = document.getElementById("actions");
        if (actions && !actions.innerHTML) {
          actions.textContent = text("loading");
        }
      }

      function bindLanguageButtons() {
        document.querySelectorAll("[data-lang-option]").forEach((button) => {
          button.addEventListener("click", () => {
            setLanguage(button.getAttribute("data-lang-option"));
          });
        });
      }

      window.addEventListener("storage", (event) => {
        if ((event.key === storageKey) && (event.newValue === "en" || event.newValue === "zh") && event.newValue !== currentLang) {
          setLanguage(event.newValue, false);
        }
      });

      async function postJson(path, body = {}) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || (data.errors || []).join("; ") || "request failed");
        }
        return data;
      }

      async function loadArtifact(ref) {
        if (!ref) return null;
        const response = await fetch("/projects/" + encodeURIComponent(projectIdValue) + "/artifact?ref=" + encodeURIComponent(ref));
        if (!response.ok) return null;
        const data = await response.json();
        return data.artifact;
      }

      function phaseLabel(phase) {
        return lookup("phaseNames." + phase) || phase;
      }

      function statusLabel(status) {
        return lookup("statusNames." + status) || status;
      }

      function phaseButtonLabel(phase) {
        return lookup("phaseButtons." + phase) || phase;
      }

      function artifactLabel(kind) {
        return lookup("artifactLabels." + kind) || kind;
      }

      function renderPendingAction(action) {
        if (!action || typeof action !== "object") return "";
        if (action.type === "provide_research_direction") {
          return text("pending.provideResearchDirection");
        }
        if (action.type === "approve_or_revise" && action.target === "contract") {
          return text("pending.approveOrReviseContract");
        }
        if (action.type === "human_feedback_received") {
          return text("pending.humanFeedbackReceived");
        }
        if (action.type === "run_phase" && action.phase) {
          return phaseButtonLabel(action.phase);
        }
        if (action.type === "revise_required") {
          const phase = phaseLabel(action.phase);
          const errors = Array.isArray(action.errors) ? action.errors.join("; ") : "";
          return format(text("pending.reviseRequired"), { phase, errors });
        }
        if (action.type === "next_human_action") {
          return action.description || action.label || action.type;
        }
        return action.label || action.description || action.type || "";
      }

      function renderPending(state) {
        const pending = state.pending_human_actions || [];
        if (!pending.length) return "";
        return '<ul class="pending-list">' + pending.map((action) => '<li>' + escapeHtml(renderPendingAction(action)) + '</li>').join("") + '</ul>';
      }

      async function refresh() {
        const response = await fetch("/projects/" + encodeURIComponent(projectIdValue) + "/state");
        const data = await response.json();
        currentState = data.state;
        renderState(currentState);
        await renderArtifacts(currentState);
      }

      function renderState(state) {
        const phasePill = document.getElementById("phase-pill");
        if (phasePill) {
          phasePill.textContent = phaseLabel(state.phase);
          phasePill.className = "phase-pill " + state.phase;
        }
        const stateJson = document.getElementById("state-json");
        if (stateJson) {
          stateJson.textContent = JSON.stringify(state, null, 2);
        }
        renderTimeline(state);
        renderActions(state);
      }

      function renderTimeline(state) {
        const completed = new Set((state.phase_history || [])
          .filter((item) => item.gate_result === "pass" || item.gate_result === "manual")
          .map((item) => item.phase));
        const items = phaseOrder.map((phase) => {
          const status = state.phase === phase ? "active" : completed.has(phase) ? "done" : "pending";
          return '<li class="' + status + '"><span></span><div><strong>' + escapeHtml(phaseLabel(phase)) + '</strong><small>' + escapeHtml(statusLabel(status)) + '</small></div></li>';
        }).join("");
        const timeline = document.getElementById("timeline");
        if (timeline) {
          timeline.innerHTML = items;
        }
      }

      function renderActions(state) {
        const actionBox = document.getElementById("actions");
        if (!actionBox) return;
        const pending = state.pending_human_actions || [];

        if (state.phase === "idle" || state.phase === "intake" || pending.some((action) => action.type === "provide_research_direction")) {
          actionBox.innerHTML = '<form id="start-form" class="stack">' +
            '<label>' + escapeHtml(text("action.researchDirection")) + '</label>' +
            '<textarea id="research-direction" rows="4" placeholder="' + escapeHtml(text("action.researchDirectionPlaceholder")) + '">' + escapeHtml(state.current?.research_direction || "") + '</textarea>' +
            '<button class="button primary" type="submit">' + escapeHtml(text("action.draftResearchContract")) + '</button>' +
            '</form>' +
            renderPending(state);
          const form = document.getElementById("start-form");
          if (form) {
            form.addEventListener("submit", async (event) => {
              event.preventDefault();
              const textValue = document.getElementById("research-direction").value.trim();
              if (!textValue) return;
              await postJson("/projects/" + encodeURIComponent(projectIdValue) + "/start", { research_direction: textValue });
              await refresh();
            });
          }
          return;
        }

        if (state.phase === "contract_review") {
          actionBox.innerHTML = '<div class="stack">' +
            '<p>' + escapeHtml(text("action.contractReviewPrompt")) + '</p>' +
            '<div class="button-row">' +
            '<button class="button primary" id="approve-contract" type="button">' + escapeHtml(text("action.approveContract")) + '</button>' +
            '<button class="button secondary" id="revise-contract" type="button">' + escapeHtml(text("action.reviseContract")) + '</button>' +
            '</div>' +
            '<textarea id="revision-feedback" rows="3" placeholder="' + escapeHtml(text("action.revisionNotePlaceholder")) + '"></textarea>' +
            '</div>';
          const approveButton = document.getElementById("approve-contract");
          if (approveButton) {
            approveButton.addEventListener("click", async () => {
              await postJson("/projects/" + encodeURIComponent(projectIdValue) + "/approve", {
                target: "contract",
                artifact_id: state.current.contract_artifact_id,
                approved_by: "human",
                note: "Approved from dashboard"
              });
              await refresh();
            });
          }
          const reviseButton = document.getElementById("revise-contract");
          if (reviseButton) {
            reviseButton.addEventListener("click", async () => {
              const feedback = document.getElementById("revision-feedback").value.trim();
              if (!feedback) return;
              await postJson("/projects/" + encodeURIComponent(projectIdValue) + "/revise", {
                target: "contract",
                artifact_id: state.current.contract_artifact_id,
                feedback
              });
              await refresh();
            });
          }
          return;
        }

        if (phaseButtonLabel(state.phase) !== state.phase) {
          actionBox.innerHTML = '<div class="stack">' +
            '<p>' + escapeHtml(text("action.runStepInfo")) + '</p>' +
            '<button class="button primary" id="advance" type="button">' + escapeHtml(phaseButtonLabel(state.phase)) + '</button>' +
            '</div>';
          const advanceButton = document.getElementById("advance");
          if (advanceButton) {
            advanceButton.addEventListener("click", async () => {
              await postJson("/projects/" + encodeURIComponent(projectIdValue) + "/advance", {});
              await refresh();
            });
          }
          return;
        }

        if (state.phase === "blocked") {
          actionBox.innerHTML = '<div class="warning">' + escapeHtml(text("action.blocked")) + '</div>';
          return;
        }

        actionBox.innerHTML = '<div class="quiet">' + escapeHtml(text("action.noRunnableAction")) + '</div>' + renderPending(state);
      }

      async function renderArtifacts(state) {
        const refs = [
          ["contract", state.current?.contract_artifact_ref],
          ["literature", state.current?.literature_artifact_ref],
          ["baseline", state.current?.baseline_artifact_ref],
          ["checklist", state.current?.checklist_artifact_ref],
          ["ideas", state.current?.idea_artifact_ref],
          ["review", state.current?.review_artifact_ref],
          ["summary", state.current?.summary_artifact_ref]
        ].filter((item) => item[1]);

        const container = document.getElementById("artifacts");
        if (!container) return;

        if (!refs.length) {
          container.innerHTML = '<div class="quiet">' + escapeHtml(text("action.noArtifactsYet")) + '</div>';
          return;
        }

        const artifacts = await Promise.all(refs.map(async ([kind, ref]) => [kind, ref, await loadArtifact(ref)]));
        container.innerHTML = artifacts.map(([kind, ref, artifact]) => {
          return '<article class="artifact">' +
            '<div class="artifact-head"><strong>' + escapeHtml(artifactLabel(kind)) + '</strong><code>' + escapeHtml(ref) + '</code></div>' +
            renderArtifactContent(kind, artifact) +
            '</article>';
        }).join("");
      }

      function renderArtifactContent(kind, artifact) {
        const content = artifact?.content;
        if (!content) return '<div class="quiet">' + escapeHtml(text("action.noContentLoaded")) + '</div>';

        if (kind === "contract") {
          return '<dl>' +
            '<dt>' + escapeHtml(text("artifact.topic")) + '</dt><dd>' + escapeHtml(content.topic) + '</dd>' +
            '<dt>' + escapeHtml(text("artifact.hypothesis")) + '</dt><dd>' + escapeHtml(content.hypothesis) + '</dd>' +
            '<dt>' + escapeHtml(text("artifact.metrics")) + '</dt><dd>' + escapeHtml((content.metrics || []).map((metric) => metric.name).join(", ")) + '</dd>' +
            '</dl>';
        }

        if (kind === "literature" && Array.isArray(content)) {
          return '<ul>' + content.map((card) => '<li><strong>' + escapeHtml(card.title) + '</strong><br><small>' + escapeHtml(card.why_relevant) + '</small></li>').join("") + '</ul>';
        }

        if (kind === "baseline") {
          return '<p><strong>' + escapeHtml(content.selected?.name || text("artifact.none")) + '</strong></p><p>' + escapeHtml(content.selected?.reason || "") + '</p>';
        }

        if (kind === "checklist") {
          return '<ul>' + (content.commands || []).map((command) => '<li><code>' + escapeHtml(command) + '</code></li>').join("") + '</ul>';
        }

        if (kind === "ideas" && Array.isArray(content)) {
          return '<ul>' + content.map((idea) => '<li><strong>' + escapeHtml(idea.title) + '</strong><br><small>' + escapeHtml(idea.expected_gain) + '</small></li>').join("") + '</ul>';
        }

        if (kind === "review") {
          return '<p>' + escapeHtml(text("artifact.recommendedIdea")) + ' <code>' + escapeHtml(content.recommended_idea_id || text("artifact.none")) + '</code></p><ul>' + (content.reviews || []).map((review) => '<li>' + escapeHtml(review.idea_id) + ': <strong>' + escapeHtml(review.decision) + '</strong></li>').join("") + '</ul>';
        }

        if (kind === "summary") {
          return '<p><strong>' + escapeHtml(text("artifact.summaryNextActions")) + '</strong></p><ul>' + (content.next_human_actions || []).map((action) => '<li>' + escapeHtml(action) + '</li>').join("") + '</ul>';
        }

        return '<pre>' + escapeHtml(JSON.stringify(content, null, 2)) + '</pre>';
      }

      bindLanguageButtons();
      setLanguage(currentLang, false);
      if (pageKind === "panel") {
        refresh();
        setInterval(refresh, 3000);
      }
    })();
  </script>`;
}

export function renderIndexPage(projects) {
  const rows = projects
    .map(
      (project) => `
        <tr>
          <td><a href="/panel/${escapeHtml(project.project_id)}">${escapeHtml(project.project_id)}</a></td>
          <td>${escapeHtml(project.phase)}</td>
          <td>${escapeHtml(project.updated_at)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en" data-ui-lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ResearchClaw Projects</title>
  ${sharedStyles()}
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">ResearchClaw</div>
        <h1 data-i18n="indexHeading">Projects</h1>
      </div>
      <div class="top-actions">
        ${renderLanguageSwitcher()}
        <a class="button" href="/panel/proj_openclaw" data-i18n="openProject">Open Demo Project</a>
      </div>
    </header>
    <section class="surface">
      <table>
        <thead>
          <tr><th data-i18n="tableProject">Project</th><th data-i18n="tablePhase">Phase</th><th data-i18n="tableUpdated">Updated</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3" data-i18n="noProjectsYet">No projects yet.</td></tr>'}</tbody>
      </table>
    </section>
  </main>

  ${buildRuntimeScript({ page: "index", projectId: "" })}
</body>
</html>`;
}

export function renderPanelPage(projectId) {
  const safeProjectId = escapeHtml(projectId);
  return `<!doctype html>
<html lang="en" data-ui-lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ResearchClaw ${safeProjectId}</title>
  ${sharedStyles()}
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <div class="eyebrow" data-i18n="panelEyebrow">ResearchClaw workflow</div>
        <h1>${safeProjectId}</h1>
      </div>
      <div class="top-actions">
        ${renderLanguageSwitcher()}
        <span id="phase-pill" class="phase-pill" data-i18n="loading">Loading...</span>
        <button class="button secondary" type="button" id="refresh" data-i18n="refresh">Refresh</button>
      </div>
    </header>

    <section class="layout">
      <aside class="surface timeline">
        <h2 data-i18n="workflowHeading">Workflow</h2>
        <ol id="timeline"></ol>
      </aside>

      <section class="main-column">
        <section class="surface action-panel">
          <h2 data-i18n="currentActionHeading">Current Action</h2>
          <div id="actions" data-i18n="loading">Loading...</div>
        </section>

        <section class="surface">
          <h2 data-i18n="artifactsHeading">Artifacts</h2>
          <div id="artifacts" class="artifact-grid" data-i18n="loading">Loading...</div>
        </section>

        <section class="surface">
          <details>
            <summary data-i18n="rawStateHeading">Raw State</summary>
            <pre id="state-json"></pre>
          </details>
        </section>
      </section>
    </section>
  </main>

  ${buildRuntimeScript({ page: "panel", projectId })}
</body>
</html>`;
}

function sharedStyles() {
  return `<style>
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --ink: #1d252c;
      --muted: #65717c;
      --line: #d8dee4;
      --surface: #ffffff;
      --blue: #2457d6;
      --green: #16784b;
      --amber: #9a6500;
      --red: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
    .topbar {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .top-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    h1, h2 {
      margin: 0;
      letter-spacing: 0;
    }
    h1 { font-size: 28px; }
    h2 {
      font-size: 15px;
      margin-bottom: 14px;
    }
    .eyebrow {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 2px;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .main-column {
      display: grid;
      gap: 16px;
    }
    .surface {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      border-bottom: 1px solid var(--line);
      padding: 10px 8px;
      vertical-align: top;
    }
    .button {
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      min-height: 36px;
      padding: 7px 12px;
    }
    .button.primary {
      background: var(--blue);
      border-color: var(--blue);
      color: #fff;
    }
    .button.secondary {
      color: var(--ink);
    }
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lang-switch {
      border: 1px solid var(--line);
      border-radius: 6px;
      display: inline-flex;
      overflow: hidden;
      background: #fff;
    }
    .lang-switch-btn {
      appearance: none;
      border: 0;
      border-right: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font: inherit;
      min-height: 32px;
      padding: 6px 10px;
    }
    .lang-switch-btn:last-child {
      border-right: 0;
    }
    .lang-switch-btn[aria-pressed="true"] {
      background: var(--blue);
      color: #fff;
    }
    .phase-pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 4px 10px;
      font-size: 13px;
      background: #fff;
      color: var(--muted);
      white-space: nowrap;
    }
    .phase-pill.blocked { color: var(--red); border-color: #f1b5ad; }
    .phase-pill.idle { color: var(--green); border-color: #8ac7a6; }
    .timeline ol, .timeline ul { margin: 0; padding: 0; }
    .timeline li {
      display: grid;
      grid-template-columns: 16px 1fr;
      gap: 10px;
      list-style: none;
      padding: 8px 0;
      border-bottom: 1px solid #edf0f2;
    }
    .timeline li:last-child { border-bottom: 0; }
    .timeline li > span {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 2px solid var(--line);
      margin-top: 4px;
    }
    .timeline li.done > span { border-color: var(--green); background: var(--green); }
    .timeline li.active > span { border-color: var(--blue); background: #dfe8ff; }
    .timeline small {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .stack {
      display: grid;
      gap: 10px;
    }
    label {
      color: var(--muted);
      font-size: 13px;
    }
    textarea {
      width: 100%;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--ink);
      font: inherit;
      padding: 10px;
    }
    .artifact-grid {
      display: grid;
      gap: 12px;
    }
    .artifact {
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }
    .artifact:first-child {
      border-top: 0;
      padding-top: 0;
    }
    .artifact-head {
      display: grid;
      gap: 4px;
      margin-bottom: 8px;
    }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }
    pre {
      overflow: auto;
      max-height: 420px;
      background: #f2f4f6;
      border-radius: 6px;
      padding: 12px;
    }
    dl {
      margin: 0;
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr);
      gap: 6px 12px;
    }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .quiet { color: var(--muted); }
    .warning { color: var(--red); }
    .pending-list { margin: 12px 0 0; padding-left: 20px; }
    @media (max-width: 760px) {
      .shell { padding: 14px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .layout { grid-template-columns: 1fr; }
      dl { grid-template-columns: 1fr; }
    }
  </style>`;
}
