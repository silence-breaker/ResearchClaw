// In-process event bus. Subscribers register per projectId so a panel only
// receives events for the project it is watching. The orchestrator emits here
// after every state write; server.js forwards the events to SSE clients.
const CLI_CHUNK_BUFFER_CAP = 200;

export class EventBus {
  constructor() {
    this.listenersByProject = new Map();
    // Per-project ring buffer of recent cli_chunk events. A panel that connects
    // AFTER a CLI run started (e.g. right after navigating from project creation)
    // missed the live emits, so the SSE endpoint replays this buffer on connect.
    this.cliChunksByProject = new Map();
  }

  subscribe(projectId, listener) {
    let listeners = this.listenersByProject.get(projectId);
    if (!listeners) {
      listeners = new Set();
      this.listenersByProject.set(projectId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersByProject.delete(projectId);
      }
    };
  }

  emit(projectId, event) {
    if (event.type === "cli_chunk") {
      let buffer = this.cliChunksByProject.get(projectId);
      if (!buffer) {
        buffer = [];
        this.cliChunksByProject.set(projectId, buffer);
      }
      buffer.push(event);
      if (buffer.length > CLI_CHUNK_BUFFER_CAP) {
        buffer.splice(0, buffer.length - CLI_CHUNK_BUFFER_CAP);
      }
    }
    const listeners = this.listenersByProject.get(projectId);
    if (!listeners) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  // Replay buffered cli_chunk events to a freshly-connected listener so it can
  // catch up on a run that started before it subscribed.
  replayCliChunks(projectId, listener) {
    const buffer = this.cliChunksByProject.get(projectId);
    if (!buffer) {
      return;
    }
    for (const event of [...buffer]) {
      listener(event);
    }
  }

  // Reset a project's cli_chunk buffer — called when a new run starts so a fresh
  // panel doesn't replay a previous run's chunks.
  clearCliChunks(projectId) {
    this.cliChunksByProject.delete(projectId);
  }
}
