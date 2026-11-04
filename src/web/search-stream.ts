import type { SearchProgress, SearchResponse, SearchStreamEvent } from "../search/contracts.js";

const interrupted = "搜索连接已中断，已返回的地点仍可查看，请重新搜索。";

/** NDJSON framing is independent of network chunk and UTF-8 character boundaries. */
export async function readSearchStream(
  response: Response,
  onProgress: (progress: SearchProgress) => void,
  signal: AbortSignal,
): Promise<SearchResponse> {
  if (!response.body) throw new Error(interrupted);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const parse = (line: string): SearchResponse | undefined => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as SearchStreamEvent;
    if (event.type === "progress" && Array.isArray(event.progress?.results) && Array.isArray(event.progress.active) && Array.isArray(event.progress.pending)) {
      onProgress(event.progress); return;
    }
    if (event.type === "complete" && Array.isArray(event.response?.categories)) { terminal = true; return event.response; }
    if (event.type === "error") { terminal = true; throw new Error(event.error?.message || interrupted); }
    throw new Error(interrupted);
  };
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error(interrupted);
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error(interrupted);
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        const result = parse(line);
        if (result) return result;
      }
      if (buffer.length > 2_000_000) throw new Error(interrupted);
      if (done) {
        const result = parse(buffer);
        if (result) return result;
        throw new Error(interrupted);
      }
    }
  } catch (error) {
    if (terminal && error instanceof Error) throw error;
    throw new Error(interrupted);
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
