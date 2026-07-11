import type { CliChunk } from "../api/types";

// Appends a cli_chunk to a bounded ring buffer (newest last). Pure: returns a new
// array, never mutates. The buffer only drives the right-column process feed
// animation — it is NOT a source of truth (snapshot is). See M2技术路线-前端 §3.2.
export function reduceCliChunks(buffer: CliChunk[], chunk: CliChunk, cap = 100): CliChunk[] {
  const next = [...buffer, chunk];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function isDegradedChunk(chunk: CliChunk): boolean {
  return chunk.degraded === true;
}

export interface CliWindow {
  windowId: string;
  provider?: string;
  cli?: string;
  model?: string;
  phase?: string;
  degraded: boolean;
  chunks: CliChunk[];
}

// 把 workflow chunk 按 windowId 归并成有序窗口（首次出现顺序）。consult chunk 走
// 独立聊天视图，这里跳过。窗口元数据由首个带值的 chunk 填充；任一 chunk degraded
// 则整窗标记 degraded（诚实：该窗降级成了 mock）。纯函数，不改输入。
export function groupCliWindows(chunks: CliChunk[]): CliWindow[] {
  const order: string[] = [];
  const map = new Map<string, CliWindow>();
  for (const c of chunks) {
    if (c.kind === "consult") continue;
    const id = c.windowId ?? "ungrouped";
    let win = map.get(id);
    if (!win) {
      win = { windowId: id, provider: c.provider, cli: c.cli, model: c.model, phase: c.phase, degraded: false, chunks: [] };
      map.set(id, win);
      order.push(id);
    }
    if (!win.provider && c.provider) win.provider = c.provider;
    if (!win.cli && c.cli) win.cli = c.cli;
    if (!win.model && c.model) win.model = c.model;
    if (!win.phase && c.phase) win.phase = c.phase;
    if (c.degraded) win.degraded = true;
    win.chunks.push(c);
  }
  return order.map((id) => map.get(id) as CliWindow);
}
