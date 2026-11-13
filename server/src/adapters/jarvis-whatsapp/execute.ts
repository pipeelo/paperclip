import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asNumber, asString, buildPaperclipEnv } from "../utils.js";

const DEFAULT_PLUGIN_KEY = "pipeelo.jarvis-eventos";
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_SEC = 5400;
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000];
const MAX_POLL_ERRORS = 12;
const DEFAULT_KEEP_ALIVE_MS = 20 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const HOST_TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"]);
const CANCELLED_MESSAGE = "run cancelado no Paperclip";
const CHAT_DISABLED_MESSAGE = "O chat do Jarvis está desligado. Fale com o Jarvis pelo WhatsApp.";

interface RunLog {
  seq: number;
  linha: string;
}

interface RunSnapshot {
  status: "aberto" | "ok" | "falhou";
  resumo: string | null;
  logs: RunLog[];
}

class PluginHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function readRetryDelays(value: unknown): number[] {
  if (!Array.isArray(value)) return DEFAULT_RETRY_DELAYS_MS;
  const delays = value.filter((item): item is number => typeof item === "number" && item >= 0);
  return delays.length > 0 ? delays : DEFAULT_RETRY_DELAYS_MS;
}

function failure(errorCode: string, errorMessage: string): AdapterExecutionResult {
  return { exitCode: 1, signal: null, timedOut: false, errorCode, errorMessage };
}

async function callPlugin(
  method: "GET" | "POST",
  url: string,
  authToken: string | undefined,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new PluginHttpError(res.status, `Plugin respondeu ${res.status} em ${method} ${url}`);
  }
  return res.json();
}

async function hostFinishedRun(url: string, authToken: string | undefined): Promise<boolean> {
  try {
    const run = (await callPlugin("GET", url, authToken)) as { status?: string };
    return typeof run.status === "string" && HOST_TERMINAL_STATUSES.has(run.status);
  } catch {
    return false;
  }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, runId, agent, context, authToken, onLog } = ctx;

  if (context.wakeReason === "chat") {
    return failure("chat_desligado", CHAT_DISABLED_MESSAGE);
  }

  const baseUrl = (asString(config.baseUrl, "") || buildPaperclipEnv(agent).PAPERCLIP_API_URL).replace(/\/+$/, "");
  const pluginKey = asString(config.pluginKey, DEFAULT_PLUGIN_KEY);
  const pollMs = Math.max(1, asNumber(config.pollMs, DEFAULT_POLL_MS));
  const timeoutMs = Math.max(1, asNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC)) * 1000;
  const retryDelays = readRetryDelays(config.retryDelaysMs);
  const runsUrl = `${baseUrl}/api/plugins/${encodeURIComponent(pluginKey)}/api/runs`;
  const runUrl = `${runsUrl}/${encodeURIComponent(runId)}`;
  const hostRunUrl = `${baseUrl}/api/heartbeat-runs/${encodeURIComponent(runId)}`;
  const finishUrl = `${runUrl}/fim`;
  const keepAliveMs = Math.max(1, asNumber(config.keepAliveMs, DEFAULT_KEEP_ALIVE_MS));
  const closeRunAsFailed = async (resumo: string) => {
    await callPlugin("POST", finishUrl, authToken, { status: "falhou", resumo }).catch(() => null);
  };
  const openBody = { runId, agentId: agent.id, agentName: agent.name, context };

  const openRun = async (): Promise<string | null> => {
    let lastError = "";
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        await callPlugin("POST", runsUrl, authToken, openBody);
        return null;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < retryDelays.length) await sleep(retryDelays[attempt]);
      }
    }
    return lastError;
  };

  const openError = await openRun();
  if (openError !== null) {
    return failure("plugin_indisponivel", `Não foi possível abrir o run no plugin: ${openError}`);
  }

  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let lastOutputAt = startedAt;
  let lastSeq = 0;
  let consecutiveErrors = 0;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const timeoutSec = Math.round(timeoutMs / 1000);
      await closeRunAsFailed(`tempo esgotado: ${timeoutSec}s sem fim da sessão`);
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorCode: "timeout",
        errorMessage: `O Jarvis do WhatsApp não fechou o run em ${Math.round(timeoutMs / 1000)}s`,
      };
    }
    await sleep(Math.min(pollMs, remaining));

    let snapshot: RunSnapshot;
    try {
      snapshot = (await callPlugin("GET", runUrl, authToken)) as RunSnapshot;
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_POLL_ERRORS) {
        const detail = err instanceof Error ? err.message : String(err);
        await closeRunAsFailed("plugin indisponível");
        return failure("plugin_indisponivel", `Plugin sem resposta após ${MAX_POLL_ERRORS} tentativas: ${detail}`);
      }
      if (err instanceof PluginHttpError && err.status === 404) {
        await openRun();
      }
      continue;
    }

    const logs = Array.isArray(snapshot.logs) ? snapshot.logs : [];
    for (const entry of logs) {
      if (entry.seq > lastSeq) {
        await onLog("stdout", `${entry.linha}\n`);
        lastSeq = entry.seq;
        lastOutputAt = Date.now();
      }
    }

    if (snapshot.status === "aberto" && (await hostFinishedRun(hostRunUrl, authToken))) {
      await closeRunAsFailed(CANCELLED_MESSAGE);
      return failure("cancelled", CANCELLED_MESSAGE);
    }

    if (snapshot.status === "aberto" && Date.now() - lastOutputAt >= keepAliveMs) {
      const waitedMin = Math.round((Date.now() - startedAt) / 60000);
      await onLog("stdout", `aguardando a sessão do Jarvis do WhatsApp (${waitedMin} min)\n`);
      lastOutputAt = Date.now();
    }

    if (snapshot.status === "ok") {
      return { exitCode: 0, signal: null, timedOut: false, summary: snapshot.resumo ?? null };
    }
    if (snapshot.status === "falhou") {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: snapshot.resumo ?? "O Jarvis do WhatsApp marcou o run como falho",
      };
    }
  }
}
