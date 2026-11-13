import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { execute } from "./execute.js";

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const servers: Server[] = [];

async function startServer(handler: Handler, hostStatus: () => string = () => "running"): Promise<string> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (req.url?.startsWith("/api/heartbeat-runs/")) {
        return json(res, 200, { id: "run-1", status: hostStatus() });
      }
      handler(req, Buffer.concat(chunks).toString("utf8"), res);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function buildCtx(baseUrl: string, overrides: Record<string, unknown> = {}, context: Record<string, unknown> = {}) {
  const logs: string[] = [];
  return {
    logs,
    ctx: {
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Jarvis",
        adapterType: "jarvis_whatsapp",
        adapterConfig: {},
      },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { baseUrl, pollMs: 20, ...overrides },
      context: { wakeReason: "issue_assigned", issueId: "issue-1", ...context },
      authToken: "token-abc",
      onLog: async (_stream: "stdout" | "stderr", chunk: string) => {
        logs.push(chunk);
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("jarvis_whatsapp adapter execute", () => {
  it("abre o run, repassa os logs e termina ok com o resumo", async () => {
    const requests: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
    let polls = 0;
    const baseUrl = await startServer((req, body, res) => {
      requests.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body });
      if (req.method === "POST") return json(res, 201, { runId: "run-1", status: "aberto" });
      polls += 1;
      if (polls === 1) return json(res, 200, { status: "aberto", resumo: null, logs: [{ seq: 1, linha: "primeiro" }] });
      if (polls === 2) {
        return json(res, 200, {
          status: "aberto",
          resumo: null,
          logs: [{ seq: 1, linha: "primeiro" }, { seq: 2, linha: "segundo" }],
        });
      }
      return json(res, 200, {
        status: "ok",
        resumo: "feito",
        logs: [{ seq: 1, linha: "primeiro" }, { seq: 2, linha: "segundo" }],
      });
    });
    const { ctx, logs } = buildCtx(baseUrl);

    const result = await execute(ctx);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.summary).toBe("feito");
    expect(logs).toEqual(["primeiro\n", "segundo\n"]);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("/api/plugins/pipeelo.jarvis-eventos/api/runs");
    expect(requests[0].auth).toBe("Bearer token-abc");
    expect(JSON.parse(requests[0].body)).toEqual({
      runId: "run-1",
      agentId: "agent-1",
      agentName: "Jarvis",
      context: { wakeReason: "issue_assigned", issueId: "issue-1" },
    });
    expect(requests[1].url).toBe("/api/plugins/pipeelo.jarvis-eventos/api/runs/run-1");
  });

  it("termina com erro quando o run falha", async () => {
    const baseUrl = await startServer((req, _body, res) => {
      if (req.method === "POST") return json(res, 201, { runId: "run-1", status: "aberto" });
      return json(res, 200, { status: "falhou", resumo: "deu ruim", logs: [] });
    });
    const { ctx } = buildCtx(baseUrl);

    const result = await execute(ctx);

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.errorMessage).toBe("deu ruim");
  });

  it("estoura o tempo quando o run não fecha", async () => {
    const baseUrl = await startServer((req, _body, res) => {
      if (req.method === "POST") return json(res, 201, { runId: "run-1", status: "aberto" });
      return json(res, 200, { status: "aberto", resumo: null, logs: [] });
    });
    const { ctx } = buildCtx(baseUrl, { timeoutSec: 1, pollMs: 100 });

    const result = await execute(ctx);

    expect(result.timedOut).toBe(true);
    expect(result.errorCode).toBe("timeout");
    expect(result.exitCode).toBeNull();
  });

  it("recusa wakeReason chat sem chamar o plugin", async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, _body, res) => {
      calls += 1;
      json(res, 201, {});
    });
    const { ctx } = buildCtx(baseUrl, {}, { wakeReason: "chat" });

    const result = await execute(ctx);

    expect(calls).toBe(0);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBe("O chat do Jarvis está desligado. Fale com o Jarvis pelo WhatsApp.");
  });

  it("termina com plugin_indisponivel quando o POST falha 3 vezes", async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, _body, res) => {
      calls += 1;
      json(res, 503, { error: "fora" });
    });
    const { ctx } = buildCtx(baseUrl, { retryDelaysMs: [5, 5] });

    const result = await execute(ctx);

    expect(calls).toBe(3);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("plugin_indisponivel");
  });

  it("termina com plugin_indisponivel após 12 erros seguidos no GET", async () => {
    let gets = 0;
    const baseUrl = await startServer((req, _body, res) => {
      if (req.method === "POST") return json(res, 201, { runId: "run-1", status: "aberto" });
      gets += 1;
      return json(res, 502, { error: "fora" });
    });
    const { ctx } = buildCtx(baseUrl, { pollMs: 5 });

    const result = await execute(ctx);

    expect(gets).toBe(12);
    expect(result.errorCode).toBe("plugin_indisponivel");
    expect(result.exitCode).toBe(1);
  });

  it("usa pluginKey configurado no caminho", async () => {
    const urls: string[] = [];
    const baseUrl = await startServer((req, _body, res) => {
      urls.push(req.url ?? "");
      if (req.method === "POST") return json(res, 201, { runId: "run-1", status: "aberto" });
      return json(res, 200, { status: "ok", resumo: "ok", logs: [] });
    });
    const { ctx } = buildCtx(baseUrl, { pluginKey: "outro.plugin" });

    await execute(ctx);

    expect(urls[0]).toBe("/api/plugins/outro.plugin/api/runs");
  });

  it("para e fecha o run no plugin quando o host cancelou o run", async () => {
    const calls: Array<{ method: string; url: string; body: string }> = [];
    const baseUrl = await startServer(
      (req, body, res) => {
        calls.push({ method: req.method ?? "", url: req.url ?? "", body });
        if (req.url?.endsWith("/fim")) return json(res, 409, { error: "já fechado" });
        if (req.method === "POST") return json(res, 201, { runId: "run-1", status: "aberto" });
        return json(res, 200, { status: "aberto", resumo: null, logs: [] });
      },
      () => "cancelled",
    );
    const { ctx } = buildCtx(baseUrl);

    const result = await execute(ctx);

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.errorCode).toBe("cancelled");
    expect(result.errorMessage).toBe("run cancelado no Paperclip");
    const fim = calls.find((call) => call.url === "/api/plugins/pipeelo.jarvis-eventos/api/runs/run-1/fim");
    expect(fim?.method).toBe("POST");
    expect(JSON.parse(fim?.body ?? "{}")).toEqual({ status: "falhou", resumo: "run cancelado no Paperclip" });
  });
});
