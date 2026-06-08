import { describe, expect, it } from "vitest";
import {
  appendConsultChunk,
  applyConsultMessage,
  isConsultChunk,
  liveSettledIntoHistory,
  startLiveConsult
} from "./consult";
import type { LiveConsult } from "./consult";
import type { CliChunk, ConsultMessage } from "../api/types";

const consultChunk = (text: string): CliChunk => ({ kind: "consult", role: "对话", text, ts: "t" });
const workflowChunk = (text: string): CliChunk => ({ phase: "contract_draft", role: "规划", text, ts: "t" });

describe("isConsultChunk", () => {
  it("matches consult-kind chunks only", () => {
    expect(isConsultChunk(consultChunk("hi"))).toBe(true);
    expect(isConsultChunk(workflowChunk("hi"))).toBe(false);
  });
});

describe("startLiveConsult", () => {
  it("creates a streaming turn with the question and empty answer", () => {
    const live = startLiveConsult("how does X work?");
    expect(live).toEqual({ question: "how does X work?", answer: "", status: "streaming" });
  });
});

describe("appendConsultChunk", () => {
  it("appends consult chunk text to a streaming turn", () => {
    let live: LiveConsult | null = startLiveConsult("q");
    live = appendConsultChunk(live, consultChunk("Hello "));
    live = appendConsultChunk(live, consultChunk("world"));
    expect(live?.answer).toBe("Hello world");
  });

  it("ignores workflow chunks", () => {
    const live = startLiveConsult("q");
    expect(appendConsultChunk(live, workflowChunk("noise"))?.answer).toBe("");
  });

  it("does not append once the turn is no longer streaming", () => {
    const done = { question: "q", answer: "done", status: "done" as const };
    expect(appendConsultChunk(done, consultChunk("late"))?.answer).toBe("done");
  });

  it("is a no-op when there is no live turn", () => {
    expect(appendConsultChunk(null, consultChunk("x"))).toBeNull();
  });
});

describe("applyConsultMessage", () => {
  it("settles a streaming turn to done and binds the raw_log ref", () => {
    const msg: ConsultMessage = { ok: true, raw_log_ref: "artifacts/x.json", question: "q", ts: "t" };
    const live = applyConsultMessage(startLiveConsult("q"), msg);
    expect(live?.status).toBe("done");
    expect(live?.rawLogRef).toBe("artifacts/x.json");
  });

  it("marks the turn as error when the consult failed", () => {
    const msg: ConsultMessage = { ok: false, question: "q", error: { code: "unavailable", message: "Claude 未接入" }, ts: "t" };
    const live = applyConsultMessage(startLiveConsult("q"), msg);
    expect(live?.status).toBe("error");
    expect(live?.error).toBe("Claude 未接入");
  });
});

describe("liveSettledIntoHistory", () => {
  it("is true once the live turn's ref appears in snapshot history", () => {
    const live = { question: "q", answer: "a", status: "done" as const, rawLogRef: "artifacts/x.json" };
    expect(liveSettledIntoHistory(live, ["artifacts/x.json"])).toBe(true);
    expect(liveSettledIntoHistory(live, ["artifacts/other.json"])).toBe(false);
  });

  it("is false for a still-streaming turn (no ref yet)", () => {
    expect(liveSettledIntoHistory(startLiveConsult("q"), [])).toBe(false);
  });
});
