import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { createTempHarness } from "./helpers.js";
import { createArtifact } from "../evidence/types.js";
import { EventBus } from "../engine/events.js";

// A stub consult-capable adapter: records every consult() request (so tests can
// assert on --resume threading + ordering) and replies from a queue.
class StubConsultAdapter {
  constructor(replies = []) {
    this.calls = [];
    this.replies = replies;
    this.idx = 0;
  }
  async consult(request) {
    this.calls.push({ ...request });
    const override = this.replies[this.idx++] || {};
    return {
      ok: true,
      adapter: "claude",
      session_id: override.session_id ?? "sess_default",
      text: override.text ?? "An answer about diffusion forecasting.",
      usage: { input_tokens: 10, output_tokens: 5, model: "claude-haiku-4-5" },
      raw: {
        transcript: override.text ?? "An answer about diffusion forecasting.",
        summary: { model: "claude-haiku-4-5", time: "t", role: "对话", summary: "An answer...", artifact_refs: [] }
      },
      ...override
    };
  }
}

// Seeds a project with one consult raw_log artifact (as M3.2 executeConsult would
// land it) and returns its ref, so promote can be tested in isolation.
function seedConsultRawLog(store, projectId, overrides = {}) {
  store.ensureProject(projectId);
  const state = store.readState(projectId);
  state.phase = "contract_review";
  const artifact = createArtifact({
    projectId,
    phase: "contract_review",
    type: "raw_log",
    workflow: "consult",
    adapter: "claude",
    content: {
      model: "claude-haiku-4-5",
      role: "对话",
      question: "How can diffusion models help forecasting?",
      answer_text: "By modeling the full predictive distribution.",
      summary: "By modeling the full predictive distribution.",
      session_id: "sess_consult_1",
      transcript_ref: "raw_payloads/fake-transcript.json",
      ...overrides
    }
  });
  const ref = store.appendArtifact(artifact);
  state.current.raw_log_artifact_refs = [ref];
  store.writeState(state);
  return ref;
}

test("promoteConsult lands a consult_note artifact and records its ref", () => {
  const { rootDir, store, orchestrator } = createTempHarness();
  const pid = "proj_promote";
  const ref = seedConsultRawLog(store, pid);

  const result = orchestrator.promoteConsult(pid, ref, "useful framing");
  const state = store.readState(pid);

  assert.ok(result.artifact_ref, "returns the new consult_note ref");
  const note = store.readArtifact(pid, result.artifact_ref);
  assert.equal(note.type, "consult_note");
  assert.equal(note.producer.adapter, "claude");
  assert.equal(note.content.source_raw_log_ref, ref);
  assert.equal(note.content.question, "How can diffusion models help forecasting?");
  assert.equal(note.content.answer_text, "By modeling the full predictive distribution.");
  assert.equal(note.content.note, "useful framing");
  assert.deepEqual(state.current.consult_note_refs, [result.artifact_ref]);
  rmSync(rootDir, { recursive: true, force: true });
});

test("promoteConsult does NOT advance the research state (red line)", () => {
  const { rootDir, store, orchestrator } = createTempHarness();
  const pid = "proj_promote_noadvance";
  const ref = seedConsultRawLog(store, pid);
  const before = store.readState(pid);
  const phaseBefore = before.phase;
  const historyLenBefore = before.phase_history.length;

  orchestrator.promoteConsult(pid, ref);
  const after = store.readState(pid);

  assert.equal(after.phase, phaseBefore, "phase must not change");
  assert.equal(after.phase_history.length, historyLenBefore, "phase_history must not grow");
  rmSync(rootDir, { recursive: true, force: true });
});

test("promoteConsult is idempotent for the same raw_log", () => {
  const { rootDir, store, orchestrator } = createTempHarness();
  const pid = "proj_promote_idem";
  const ref = seedConsultRawLog(store, pid);

  const first = orchestrator.promoteConsult(pid, ref);
  const second = orchestrator.promoteConsult(pid, ref);
  const state = store.readState(pid);

  assert.equal(second.artifact_ref, first.artifact_ref, "same ref returned");
  assert.equal(state.current.consult_note_refs.length, 1, "only one note recorded");
  rmSync(rootDir, { recursive: true, force: true });
});

test("promoteConsult rejects a non-consult raw_log", () => {
  const { rootDir, store, orchestrator } = createTempHarness();
  const pid = "proj_promote_reject";
  store.ensureProject(pid);
  const artifact = createArtifact({
    projectId: pid,
    phase: "contract_draft",
    type: "raw_log",
    workflow: "cli_transcript", // workflow transcript, not a consult turn
    adapter: "claude",
    content: { summary: "draft transcript" }
  });
  const ref = store.appendArtifact(artifact);

  assert.throws(() => orchestrator.promoteConsult(pid, ref), /consult/i);
  rmSync(rootDir, { recursive: true, force: true });
});

test("a promoted consult_note is not treated as research evidence", () => {
  const { rootDir, store, orchestrator } = createTempHarness();
  const pid = "proj_promote_evidence";
  const ref = seedConsultRawLog(store, pid);
  orchestrator.promoteConsult(pid, ref);
  const state = store.readState(pid);

  const evidenceTypes = orchestrator.availableArtifacts(state).map((a) => a.type);
  assert.ok(!evidenceTypes.includes("consult_note"), "consult_note must not be an evidence artifact");
  rmSync(rootDir, { recursive: true, force: true });
});

// --- M3.2: beginConsult / executeConsult / state.consult / serialization ---

test("beginConsult reports unavailable when the adapter has no consult (mock)", async () => {
  const { rootDir, orchestrator } = createTempHarness(); // default MockModelAdapter
  const ack = await orchestrator.beginConsult("proj_unavail", "hello?");
  assert.equal(ack.ok, false);
  assert.equal(ack.running, false);
  assert.equal(ack.error.code, "unavailable");
  rmSync(rootDir, { recursive: true, force: true });
});

test("executeConsult lands a consult raw_log and records the session, without advancing state", async () => {
  const adapter = new StubConsultAdapter([{ session_id: "sess_a" }]);
  const { rootDir, store, orchestrator } = createTempHarness(adapter);
  const pid = "proj_consult_exec";
  store.ensureProject(pid);
  const before = store.readState(pid);
  before.phase = "contract_review";
  store.writeState(before);

  await orchestrator.executeConsult(pid, "How can diffusion models help forecasting?");
  const state = store.readState(pid);

  assert.equal(state.phase, "contract_review", "phase must not change");
  assert.equal(state.phase_history.length, 0, "phase_history must not grow");
  assert.equal(state.consult.session_id, "sess_a");
  assert.equal(state.consult.turn_count, 1);
  assert.equal(state.consult.raw_log_refs.length, 1);
  assert.equal(state.current.raw_log_artifact_refs.length, 1);

  const raw = store.readArtifact(pid, state.consult.raw_log_refs[0]);
  assert.equal(raw.type, "raw_log");
  assert.equal(raw.producer.workflow, "consult");
  assert.equal(raw.content.question, "How can diffusion models help forecasting?");
  assert.ok(raw.content.answer_text.includes("diffusion"));
  rmSync(rootDir, { recursive: true, force: true });
});

test("executeConsult resumes the stored session on later turns (serialized)", async () => {
  const adapter = new StubConsultAdapter([{ session_id: "s1" }, { session_id: "s2" }]);
  const { rootDir, store, orchestrator } = createTempHarness(adapter);
  const pid = "proj_consult_resume";
  store.ensureProject(pid);

  // Fire two turns concurrently — serialization must order them so turn 2 resumes turn 1.
  await Promise.all([
    orchestrator.executeConsult(pid, "first question"),
    orchestrator.executeConsult(pid, "second question")
  ]);
  const state = store.readState(pid);

  assert.equal(adapter.calls.length, 2);
  assert.equal(adapter.calls[0].session_id ?? null, null, "first turn has no session to resume");
  assert.equal(adapter.calls[1].session_id, "s1", "second turn resumes the first turn's session");
  assert.equal(state.consult.session_id, "s2");
  assert.equal(state.consult.turn_count, 2);
  rmSync(rootDir, { recursive: true, force: true });
});

test("executeConsult emits a consult_message event", async () => {
  const eventBus = new EventBus();
  const messages = [];
  const adapter = new StubConsultAdapter([{ session_id: "sess_evt" }]);
  const { rootDir, store, orchestrator } = createTempHarness(adapter, { eventBus });
  const pid = "proj_consult_evt";
  eventBus.subscribe(pid, (event) => {
    if (event.type === "consult_message") messages.push(event.data);
  });
  store.ensureProject(pid);

  await orchestrator.executeConsult(pid, "a question");

  assert.equal(messages.length, 1);
  assert.ok(messages[0].raw_log_ref, "carries the landed raw_log ref");
  assert.equal(messages[0].question, "a question");
  assert.equal(messages[0].session_id, "sess_evt");
  rmSync(rootDir, { recursive: true, force: true });
});

// --- M4: phase timing ---

test("phase transitions stamp current.phase_started_at", async () => {
  const { rootDir, store, orchestrator } = createTempHarness();
  const pid = "proj_phase_timer";
  await orchestrator.startFromText(pid, "Explore retrieval reranking");
  const drafted = store.readState(pid);
  assert.equal(drafted.phase, "contract_review");
  assert.equal(typeof drafted.current.phase_started_at, "string");
  assert.ok(drafted.current.phase_started_at.length > 0);

  await orchestrator.approve(pid, { target: "contract", artifact_id: drafted.current.contract_artifact_id });
  const approved = store.readState(pid);
  assert.equal(approved.phase, "literature_scouting");
  assert.equal(typeof approved.current.phase_started_at, "string");
  rmSync(rootDir, { recursive: true, force: true });
});
