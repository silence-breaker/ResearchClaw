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
