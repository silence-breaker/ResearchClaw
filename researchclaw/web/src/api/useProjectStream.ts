import { useCallback, useEffect, useState } from "react";
import type { CliChunk, ConsultMessage, ProjectState } from "./types";
import { fetchState, sendConsult as apiSendConsult } from "./client";
import { reduceCliChunks } from "../lib/cliStream";
import {
  appendConsultChunk,
  applyConsultMessage,
  isConsultChunk,
  startLiveConsult,
  type LiveConsult
} from "../lib/consult";

export type StreamStatus = "connecting" | "live" | "polling";

interface StreamResult {
  state: ProjectState | null;
  status: StreamStatus;
  error: string | null;
  cliChunks: CliChunk[];
  liveConsult: LiveConsult | null;
  sendConsult: (message: string) => Promise<void>;
}

// Subscribes to the backend SSE stream for one project. Each `snapshot` event
// carries the full ProjectState, so we just replace local state wholesale.
// If the stream errors, we fall back to polling GET /state every 5s.
export function useProjectStream(projectId: string | undefined): StreamResult {
  const [state, setState] = useState<ProjectState | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [cliChunks, setCliChunks] = useState<CliChunk[]>([]);
  const [liveConsult, setLiveConsult] = useState<LiveConsult | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    setState(null);
    setStatus("connecting");
    setError(null);
    setCliChunks([]);
    setLiveConsult(null);

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollTimer) return;
      setStatus("polling");
      const poll = () =>
        fetchState(projectId)
          .then(setState)
          .catch((err) => setError(String(err)));
      poll();
      pollTimer = setInterval(poll, 5000);
    };

    const source = new EventSource(`/projects/${projectId}/stream`);
    source.addEventListener("snapshot", (event) => {
      try {
        setState(JSON.parse((event as MessageEvent).data) as ProjectState);
        setStatus("live");
        setError(null);
      } catch (err) {
        setError(String(err));
      }
    });
    // cli_chunk drives the right-column process feed only — it never updates the
    // conclusion views (those come from `snapshot`). consult-kind chunks stream
    // into the live consult turn; workflow chunks buffer for the process feed.
    source.addEventListener("cli_chunk", (event) => {
      try {
        const chunk = JSON.parse((event as MessageEvent).data) as CliChunk;
        if (isConsultChunk(chunk)) {
          setLiveConsult((prev) => appendConsultChunk(prev, chunk));
        } else {
          setCliChunks((prev) => reduceCliChunks(prev, chunk));
        }
      } catch {
        /* tolerate a malformed chunk */
      }
    });
    // consult_message settles the live turn (done + raw_log ref, or error).
    source.addEventListener("consult_message", (event) => {
      try {
        const msg = JSON.parse((event as MessageEvent).data) as ConsultMessage;
        setLiveConsult((prev) => applyConsultMessage(prev, msg));
      } catch {
        /* tolerate a malformed message */
      }
    });
    source.onerror = () => {
      // EventSource auto-reconnects; meanwhile poll so the panel stays fresh.
      startPolling();
    };

    return () => {
      source.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [projectId]);

  // Optimistically start a live turn, then POST. The streaming reply + final
  // settle arrive over SSE (cli_chunk/consult_message). An unavailable/refused
  // ack flips the live turn to an honest error — never a fake reply.
  const sendConsult = useCallback(
    async (message: string) => {
      if (!projectId || !message.trim()) {
        return;
      }
      setLiveConsult(startLiveConsult(message));
      try {
        const ack = await apiSendConsult(projectId, message);
        if (!ack.ok) {
          setLiveConsult((prev) => (prev ? { ...prev, status: "error", error: ack.error?.message ?? "Claude 未接入" } : prev));
        }
      } catch (err) {
        setLiveConsult((prev) => (prev ? { ...prev, status: "error", error: String(err) } : prev));
      }
    },
    [projectId]
  );

  return { state, status, error, cliChunks, liveConsult, sendConsult };
}
