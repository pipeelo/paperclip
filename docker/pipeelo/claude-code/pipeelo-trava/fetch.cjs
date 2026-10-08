"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { mudaTool, avisoDeBloqueio } = require("./trava.cjs");

const TRAVA = path.join(__dirname, "trava.cjs");
let resposta = null;

function quemPediuAgora() {
  if (resposta) return resposta;
  try {
    const saida = execFileSync(process.execPath, [TRAVA, "--quem"], {
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 20000,
      encoding: "utf8",
    });
    resposta = JSON.parse(saida);
  } catch (e) {
    resposta = { restrito: true, pessoas: [], motivo: `não confirmei quem pediu (${e.message})` };
  }
  return resposta;
}

function barrar(metodo, url) {
  if (!process.env.PAPERCLIP_RUN_ID || !mudaTool(metodo, url)) return;
  const quem = quemPediuAgora();
  if (quem.restrito) {
    const erro = new Error(avisoDeBloqueio(quem, `${String(metodo).toUpperCase()} ${url}`));
    erro.code = "PIPEELO_TRAVA_TOOLS";
    throw erro;
  }
}

function urlDaRequisicao(protocolo, a, b) {
  if (typeof a === "string" || a instanceof URL) return { url: String(a), opcoes: typeof b === "object" && b ? b : {} };
  const o = a || {};
  const host = o.hostname || o.host || "localhost";
  const porta = o.port ? `:${o.port}` : "";
  return { url: `${o.protocol || protocolo}//${host}${porta}${o.path || "/"}`, opcoes: o };
}

if (typeof globalThis.fetch === "function") {
  const original = globalThis.fetch;
  globalThis.fetch = function fetchComTrava(entrada, init) {
    const url = typeof entrada === "string" || entrada instanceof URL ? String(entrada) : entrada?.url;
    const metodo = init?.method || (typeof entrada === "object" && entrada && !(entrada instanceof URL) ? entrada.method : "GET") || "GET";
    try {
      barrar(metodo, url);
    } catch (e) {
      return Promise.reject(e);
    }
    return original.call(this, entrada, init);
  };
}

for (const [nome, protocolo] of [["http", "http:"], ["https", "https:"]]) {
  const mod = require(nome);
  for (const fn of ["request", "get"]) {
    const original = mod[fn];
    mod[fn] = function requestComTrava(a, b, c) {
      const { url, opcoes } = urlDaRequisicao(protocolo, a, b);
      barrar(fn === "get" ? "GET" : opcoes.method || "GET", url);
      return original.call(this, a, b, c);
    };
  }
}
