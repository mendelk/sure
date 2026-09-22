import { useCallback, useEffect, useRef, useState } from "react";
import { executeSureqlQuery, type SureqlResult } from "./api/transactions";

export type SureqlPreviewStatus = "idle" | "running" | "success" | "error";

export interface SureqlPreview {
  status: SureqlPreviewStatus;
  /** Exact draft text of the latest finished attempt. */
  attemptedQuery: string | null;
  /** Draft text that produced `result`; null until the first success. */
  resultQuery: string | null;
  /** Last successful result; retained when a later draft fails. */
  result: SureqlResult | null;
  /** Latest preview error; cleared when a new run starts or succeeds. */
  error: string | null;
  /** Draft text currently in flight, if any. */
  runningQuery: string | null;
  run: (endpoint: string, source: string) => void;
  reset: () => void;
}

/**
 * Live SureQL preview state for the report configuration dialog. Draft text
 * stays with the caller; this hook tracks one in-flight attempt at a time,
 * ignores late responses from superseded drafts, and aborts replaced
 * requests so rapid repeated Runs execute the latest draft exactly once.
 */
export function useSureqlPreview(): SureqlPreview {
  const [status, setStatus] = useState<SureqlPreviewStatus>("idle");
  const [attemptedQuery, setAttemptedQuery] = useState<string | null>(null);
  const [resultQuery, setResultQuery] = useState<string | null>(null);
  const [result, setResult] = useState<SureqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningQuery, setRunningQuery] = useState<string | null>(null);
  const requestRef = useRef(0);
  const runningRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    requestRef.current += 1;
    runningRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setAttemptedQuery(null);
    setResultQuery(null);
    setResult(null);
    setError(null);
    setRunningQuery(null);
  }, []);

  useEffect(
    () => () => {
      requestRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  const run = useCallback((endpoint: string, source: string) => {
    if (source.trim().length === 0) return;
    if (runningRef.current === source) return;

    requestRef.current += 1;
    const requestId = requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    runningRef.current = source;
    setRunningQuery(source);
    setStatus("running");
    setError(null);

    void (async () => {
      try {
        const data = await executeSureqlQuery(endpoint, source, { signal: controller.signal });
        if (requestRef.current !== requestId) return;
        runningRef.current = null;
        abortRef.current = null;
        setAttemptedQuery(source);
        setResultQuery(source);
        setResult(data);
        setError(null);
        setRunningQuery(null);
        setStatus("success");
      } catch (reason: unknown) {
        if (requestRef.current !== requestId) return;
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        runningRef.current = null;
        abortRef.current = null;
        setAttemptedQuery(source);
        setRunningQuery(null);
        setStatus("error");
        setError(reason instanceof Error ? reason.message : "Preview failed. Run again.");
      }
    })();
  }, []);

  return { status, attemptedQuery, resultQuery, result, error, runningQuery, run, reset };
}
