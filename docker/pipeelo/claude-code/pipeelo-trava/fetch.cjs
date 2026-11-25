"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { mudaTool, avisoDeBloqueio, lintar, avisoDeLint, rotaGlobal } = require("./trava.cjs");

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

function falha(mensagem, code) {
  const erro = new Error(mensagem);
  erro.code = code;
  return erro;
}

function vigiada(metodo, url) {
  return Boolean(process.env.PAPERCLIP_RUN_ID) && mudaTool(metodo, url);
}

function barrar(metodo, url, corpo) {
  const oQue = `${String(metodo).toUpperCase()} ${url}`;
  if (corpo === null) throw falha(`BLOQUEADO pelo lint da trava: ${oQue}. A trava não lê este corpo. Mande o corpo como texto JSON.`, "PIPEELO_TRAVA_LINT");
  const lint = lintar(corpo);
  for (const a of lint.avisos) process.stderr.write(`PIPEELO_LINT_AVISO ${a.texto}\n`);
  if (lint.erros.length) throw falha(avisoDeLint(lint, oQue), "PIPEELO_TRAVA_LINT");
  if (!rotaGlobal(url, corpo)) return;
  const quem = quemPediuAgora();
  if (quem.restrito) throw falha(avisoDeBloqueio(quem, oQue), "PIPEELO_TRAVA_TOOLS");
}

function textoDoCorpo(entrada, init) {
  const corpo = init && "body" in init ? init.body : entrada?.body;
  if (corpo == null) return "";
  if (typeof corpo === "string") return corpo;
  if (corpo instanceof URLSearchParams) return String(corpo);
  if (ArrayBuffer.isView(corpo) || corpo instanceof ArrayBuffer) return Buffer.from(corpo).toString("utf8");
  return null;
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
    if (vigiada(metodo, url)) {
      try {
        barrar(metodo, url, textoDoCorpo(entrada, init));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return original.call(this, entrada, init);
  };
}

for (const [nome, protocolo] of [["http", "http:"], ["https", "https:"]]) {
  const mod = require(nome);
  const original = mod.request;
  mod.request = function requestComTrava(a, b, c) {
    const { url, opcoes } = urlDaRequisicao(protocolo, a, b);
    const metodo = opcoes.method || "GET";
    const req = original.call(this, a, b, c);
    if (!vigiada(metodo, url)) return req;
    const partes = [];
    const parte = (chunk, enc) => partes.push(typeof chunk === "string" ? Buffer.from(chunk, typeof enc === "string" ? enc : "utf8") : Buffer.from(chunk));
    const write = req.write;
    const end = req.end;
    req.write = function (chunk, enc, cb) {
      if (chunk != null) parte(chunk, enc);
      const pronto = typeof enc === "function" ? enc : cb;
      if (typeof pronto === "function") process.nextTick(pronto);
      return true;
    };
    req.end = function (chunk, enc, cb) {
      if (typeof chunk === "function") [cb, chunk] = [chunk, null];
      else if (typeof enc === "function") [cb, enc] = [enc, undefined];
      if (chunk != null) parte(chunk, enc);
      const corpo = Buffer.concat(partes);
      try {
        barrar(metodo, url, corpo.toString("utf8"));
      } catch (e) {
        req.destroy(e);
        return req;
      }
      if (corpo.length) write.call(req, corpo);
      return end.call(req, cb);
    };
    return req;
  };
}
