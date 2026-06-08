import { useEffect, useState } from "react";
import type { CliChunk, ProjectState } from "./types";
import { fetchState } from "./client";
import { reduceCliChunks } from "../lib/cliStream";

export type StreamStatus = "connecting" | "live" | "polling";

interface StreamResult {
  state: ProjectState | null;
  status: StreamStatus;
  error: string | null;
  cliChunks: CliChunk[];
}

// Subscribes to the backend SSE stream for one project. Each `snapshot` event
// carries the full ProjectState, so we just replace local state wholesale.
// If the stream errors, we fall back to polling GET /state every 5s.
export function useProjectStream(projectId: string | undefined): StreamResult {
  const [state, setState] = useState<ProjectState | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [cliChunks, setCliChunks] = useState<CliChunk[]>([]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    setState(null);
    setStatus("connecting");
    setError(null);
    setCliChunks([]);

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
    // conclusion views (those come from `snapshot`). Buffered with a cap.
    source.addEventListener("cli_chunk", (event) => {
      try {
        const chunk = JSON.parse((event as MessageEvent).data) as CliChunk;
        setCliChunks((prev) => reduceCliChunks(prev, chunk));
      } catch {
        /* tolerate a malformed chunk */
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

  return { state, status, error, cliChunks };
}
