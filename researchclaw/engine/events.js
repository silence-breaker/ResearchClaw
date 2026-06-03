// In-process event bus. Subscribers register per projectId so a panel only
// receives events for the project it is watching. The orchestrator emits here
// after every state write; server.js forwards the events to SSE clients.
export class EventBus {
  constructor() {
    this.listenersByProject = new Map();
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
    const listeners = this.listenersByProject.get(projectId);
    if (!listeners) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(event);
    }
  }
}
