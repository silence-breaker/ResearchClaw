import type { CliChunk, ConsultMessage } from "../api/types";

// Pure consult view-state helpers. The finalized turn history is rendered from
// the SSE snapshot (state.consult.raw_log_refs) — the single source of truth.
// `LiveConsult` is the one optimistic in-flight turn the panel shows while a
// reply streams in; it is dropped once its raw_log lands in snapshot history.
// consult is process channel only — never a conclusion (两通道红线).
export interface LiveConsult {
  question: string;
  answer: string;
  status: "streaming" | "done" | "error";
  rawLogRef?: string;
  error?: string;
}

export function isConsultChunk(chunk: CliChunk): boolean {
  return chunk.kind === "consult";
}

export function startLiveConsult(question: string): LiveConsult {
  return { question, answer: "", status: "streaming" };
}

// Appends a consult chunk's text to the streaming turn. Ignores workflow chunks,
// chunks without text, and any chunk once the turn has settled. Pure.
export function appendConsultChunk(live: LiveConsult | null, chunk: CliChunk): LiveConsult | null {
  if (!live || live.status !== "streaming") {
    return live;
  }
  if (!isConsultChunk(chunk) || !chunk.text) {
    return live;
  }
  return { ...live, answer: live.answer + chunk.text };
}

// Settles the streaming turn when the consult_message arrives: done (+ raw_log
// ref so it can be promoted) or error (honest failure text). Pure.
export function applyConsultMessage(live: LiveConsult | null, msg: ConsultMessage): LiveConsult | null {
  if (!live) {
    return live;
  }
  if (msg.ok) {
    return { ...live, status: "done", rawLogRef: msg.raw_log_ref };
  }
  return { ...live, status: "error", error: msg.error?.message ?? "consult failed" };
}

// True once the live turn's raw_log ref appears in snapshot history, so the panel
// can drop the optimistic turn and render it from the durable snapshot instead.
export function liveSettledIntoHistory(live: LiveConsult | null, historyRefs: string[]): boolean {
  return Boolean(live?.rawLogRef && historyRefs.includes(live.rawLogRef));
}
