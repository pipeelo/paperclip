"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { lintar, lerConfig, rotaGlobal } = require("./trava.cjs");
const { decidir } = require("./hook.cjs");

const FIXTURES = path.join(__dirname, "__fixtures__");
const CONFIG = lerConfig();
const SEM_EXCECAO = { ...CONFIG, excecoesLint: [] };
const ANDRE = CONFIG.liberados[0].id;

const fixture = (arquivo) => fs.readFileSync(path.join(FIXTURES, arquivo), "utf8");
const regras = (r) => r.erros.map((e) => e.regra);
const corpoDeTool = (name, script) => JSON.stringify({ name, script });
const corpoDeFuncao = (name, properties) => JSON.stringify({ name, is_visible: false, function_calling: { name, description: "x", parameters: { type: "object", additionalProperties: true, properties } } });

for (const arquivo of [
  "fn_custom_agendar_instalacao.js",
  "fn_custom_agendar_mudanca_endereco.js",
  "fn_custom_agendar_visita_sinal.js",
  "fn_custom_agendar_visita_suporte.js",
  "fn_custom_buscar_datas_reagendamento.js",
  "fn_custom_consultar_vagas_instalacao.js",
  "fn_custom_reagendar_os.js",
]) {
  test(`regra 1 barra ${arquivo}`, () => {
    const r = lintar(corpoDeTool(arquivo.replace(/^fn_|\.js$/g, ""), fixture(arquivo)), CONFIG);
    assert.deepStrictEqual(regras(r), [1]);
  });
}

test("1ª versão de custom_consultar_area_do_endereco: regras 1 e 3 barram", () => {
  const r = lintar(corpoDeTool("custom_consultar_area_do_endereco", fixture("novo_custom_area_do_endereco.js")), SEM_EXCECAO);
  assert.deepStrictEqual(regras(r), [1, 3]);
});

test("regra 3 não pega return {} de função interna (falso positivo do buscar_datas_reagendamento)", () => {
  const script = [
    "const acharOs = async (id) => {",
    "  const r = await axios.get(`${environments.ERP_URL}/ordens/${id}`);",
    "  return { idOs: r.data.id, dia: r.data.dia, agenda: r.data.agenda };",
    "};",
    "return (async () => {",
    "  const achada = await acharOs(params.id_ordem_servico);",
    "  return `DATAS_DISPONIVEIS ${achada.dia}`;",
    "})();",
  ].join("\n");
  assert.deepStrictEqual(lintar(corpoDeTool("custom_buscar_datas_reagendamento", script), CONFIG).erros, []);
});

test("regra 3 pega o valor final na função principal chamada pelo return do script", () => {
  const script = [
    "const principal = async () => {",
    "  const ajuda = () => { return { agenda: 1 }; };",
    "  return { agenda: ajuda().agenda, data: '2026-01-01' };",
    "};",
    "return (async () => await principal())();",
  ].join("\n");
  assert.deepStrictEqual(regras(lintar(corpoDeTool("custom_consultar_vaga", script), CONFIG)), [3]);
  assert.deepStrictEqual(regras(lintar(corpoDeTool("custom_consultar_vaga", "return { for_ai: 'x', fila: 'suporte' };"), CONFIG)), [3]);
});

test("area_v2 com a exceção do config passa", () => {
  const r = lintar(corpoDeTool("custom_consultar_area_do_endereco", fixture("area_v2.js")), CONFIG);
  assert.deepStrictEqual(r.erros, []);
  assert.deepStrictEqual(r.avisos, []);
});

test("area_v2 sem a exceção: regra 1 barra", () => {
  const r = lintar(corpoDeTool("custom_consultar_area_do_endereco", fixture("area_v2.js")), SEM_EXCECAO);
  assert.deepStrictEqual(regras(r), [1]);
});

test("regra 2 barra enum que lê e grava", () => {
  const r = lintar(corpoDeFuncao("custom_agendar_visita_suporte", { acao: { type: "string", enum: ["consultar", "agendar"] }, data: { type: "string" } }), CONFIG);
  assert.deepStrictEqual(regras(r), [2]);
  assert.match(r.erros[0].texto, /acao/);
});

test("regra 2 passa enum só de escrita", () => {
  const r = lintar(corpoDeFuncao("custom_agendar_visita_suporte", { acao: { type: "string", enum: ["agendar"] } }), CONFIG);
  assert.deepStrictEqual(r.erros, []);
});

test("função de escrita limpa passa", () => {
  const script = "const { id_agenda, data } = params;\nconst r = await axios.post(`${environments.ERP_URL}/os`, { id_agenda, data });\nreturn JSON.stringify({ ok: r.status === 200, protocolo: r.data.protocolo });";
  assert.deepStrictEqual(lintar(corpoDeTool("custom_agendar_visita", script), CONFIG), { nome: "custom_agendar_visita", erros: [], avisos: [] });
  const funcao = corpoDeFuncao("custom_agendar_visita", { id_agenda: { type: "number" }, data: { type: "string" } });
  assert.deepStrictEqual(lintar(funcao, CONFIG), { nome: "custom_agendar_visita", erros: [], avisos: [] });
});

test("regra 4 avisa lista grande de nomes e ignora status técnico", () => {
  const nomes = lintar(corpoDeTool("custom_consultar_x", "const T = ['JOAO SILVA', 'MARIA', 'PEDRO', 'ANA PAULA', 'JOSÉ'];"), CONFIG);
  assert.deepStrictEqual(nomes.avisos.map((a) => a.regra), [4]);
  const chaves = lintar(corpoDeTool("custom_consultar_x", "const T = { 'JOAO SILVA': 1, MARIA: 2, PEDRO: 3, 'ANA PAULA': 4, JOSE: 5 };"), CONFIG);
  assert.deepStrictEqual(chaves.avisos.map((a) => a.regra), [4]);
  const status = lintar(corpoDeTool("custom_consultar_x", "const S = ['ATIVO', 'INATIVO', 'SUSPENSO', 'CANCELADO', 'BLOQUEADO', '', 'null'];"), CONFIG);
  assert.deepStrictEqual(status.avisos, []);
});

test("regra 5 avisa nome sem verbo", () => {
  const r = lintar(corpoDeTool("custom_area_do_endereco", "return 1;"), CONFIG);
  assert.deepStrictEqual(r.erros, []);
  assert.deepStrictEqual(r.avisos.map((a) => a.regra), [5]);
});

test("PUT só com script roda as regras que não dependem do nome", () => {
  const r = lintar(JSON.stringify({ script: fixture("novo_custom_area_do_endereco.js") }), CONFIG);
  assert.deepStrictEqual(regras(r), [1]);
});

test("/v1/tool é global sem type ou com LIBRARY; com CUSTOM é do tenant", () => {
  assert.strictEqual(rotaGlobal("https://api.pipeelo.com/v1/tool/1", ""), true);
  assert.strictEqual(rotaGlobal("https://api.pipeelo.com/v1/tool", JSON.stringify({ type: "LIBRARY" })), true);
  assert.strictEqual(rotaGlobal("https://api.pipeelo.com/v1/tool", JSON.stringify({ type: "CUSTOM" })), false);
  assert.strictEqual(rotaGlobal("https://admin.pipeelo.com/api/admin/library-tools/1", JSON.stringify({ type: "CUSTOM" })), true);
  assert.strictEqual(rotaGlobal("https://api.pipeelo.com/v1/custom-command/1", ""), false);
});

test("hook barra curl de escrita para qualquer pessoa", async () => {
  const semRun = { env: {} };
  for (const command of [
    "curl -s -X PUT https://api.pipeelo.com/v1/custom-command/1 -H 'Content-Type: application/json' -d '{}'",
    "python3 -c \"import requests; requests.post('https://api.pipeelo.com/v1/function-calling', json={})\"",
  ]) {
    assert.match(await decidir({ tool_name: "Bash", tool_input: { command } }, semRun), /Grave pela skill com node/);
  }
  for (const command of [
    "curl -s https://api.pipeelo.com/v1/custom-command/1 -H 'Authorization: Bearer x'",
    "curl -s -X POST https://api.pipeelo.com/v1/tool-execute -d '{}'",
    "node update-tool-script.js tok 1 custom_x /tmp/x.js",
  ]) {
    assert.strictEqual(await decidir({ tool_name: "Bash", tool_input: { command } }, semRun), null);
  }
});

function paperclipFalso(estado) {
  const servidor = http.createServer((req, res) => {
    const rotas = {
      "/api/heartbeat-runs/r1": { companyId: "c1", contextSnapshot: { issueId: "i1" } },
      "/api/issues/i1": { id: "i1", createdByUserId: estado.criador, description: "" },
      "/api/issues/i1/comments": estado.comentarios,
    };
    if (/^\/v1\/(custom-command|tool)\//.test(req.url)) {
      let corpo = "";
      req.on("data", (d) => (corpo += d));
      req.on("end", () => {
        estado.recebido.push(corpo);
        res.end("ok");
      });
      return;
    }
    const resposta = rotas[req.url];
    res.writeHead(resposta ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(resposta ?? {}));
  });
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok(servidor)));
}

function rodar(codigo, porta) {
  const env = { ...process.env, PAPERCLIP_RUN_ID: "r1", PAPERCLIP_API_URL: `http://127.0.0.1:${porta}`, PAPERCLIP_API_KEY: "k", NODE_OPTIONS: "" };
  return new Promise((ok) => {
    const filho = execFile(process.execPath, ["-"], { env }, (erro, stdout, stderr) => ok({ stdout: stdout.trim(), stderr }));
    filho.stdin.end(codigo);
  });
}

function viaFetch(url, corpo) {
  return `globalThis.fetch = async () => "stub";
require(${JSON.stringify(path.join(__dirname, "fetch.cjs"))});
fetch(${JSON.stringify(url)}, { method: "PUT", body: ${JSON.stringify(corpo)} }).then(() => console.log("ENVIADO"), (e) => console.log(e.code));`;
}

function viaHttp(caminho, corpo, porta) {
  return `
require(${JSON.stringify(path.join(__dirname, "fetch.cjs"))});
const http = require("node:http");
const req = http.request({ hostname: "api.pipeelo.com", port: ${porta}, path: ${JSON.stringify(caminho)}, method: "PUT", lookup: (h, o, cb) => o && o.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4), headers: { "Content-Type": "application/json" } }, (res) => { res.resume(); res.on("end", () => console.log("ENVIADO")); });
req.on("error", (e) => console.log(e.code));
req.end(${JSON.stringify(corpo)});`;
}

test("regra de 5 pontos: rota de tenant libera quem não é liberado; rota global barra", async (t) => {
  const estado = { criador: "lucas-123456", comentarios: [], recebido: [] };
  const servidor = await paperclipFalso(estado);
  const porta = servidor.address().port;
  t.after(() => servidor.close());
  const limpo = corpoDeTool("custom_agendar_visita", "return JSON.stringify({ ok: true });");
  const sujo = corpoDeTool("custom_agendar_visita", fixture("fn_custom_agendar_visita_suporte.js"));

  await t.test("http.request com lint limpo em /v1/custom-command envia", async () => {
    const r = await rodar(viaHttp("/v1/custom-command/1", limpo, porta), porta);
    assert.strictEqual(r.stdout, "ENVIADO", r.stderr);
  });

  await t.test("http.request com lint sujo não envia e emite error", async () => {
    estado.recebido = [];
    const r = await rodar(viaHttp("/v1/custom-command/1", sujo, porta), porta);
    assert.strictEqual(r.stdout, "PIPEELO_TRAVA_LINT");
    assert.deepStrictEqual(estado.recebido, []);
  });

  await t.test("http.request na rota global /v1/tool barra quem não é liberado", async () => {
    const r = await rodar(viaHttp("/v1/tool/1", limpo, porta), porta);
    assert.strictEqual(r.stdout, "PIPEELO_TRAVA_TOOLS");
  });

  await t.test("fetch com lint sujo é barrado", async () => {
    const r = await rodar(viaFetch("https://api.pipeelo.com/v1/custom-command/1", sujo), porta);
    assert.strictEqual(r.stdout, "PIPEELO_TRAVA_LINT");
  });

  await t.test("fetch com lint limpo em /v1/function-calling libera", async () => {
    const r = await rodar(viaFetch("https://api.pipeelo.com/v1/function-calling/1", corpoDeFuncao("custom_agendar_visita", { id_agenda: { type: "number" } })), porta);
    assert.strictEqual(r.stdout, "ENVIADO", r.stderr);
  });

  await t.test("fetch em /v1/tool (global) barra quem não é liberado", async () => {
    const r = await rodar(viaFetch("https://api.pipeelo.com/v1/tool/1", limpo), porta);
    assert.strictEqual(r.stdout, "PIPEELO_TRAVA_TOOLS");
  });

  await t.test("fetch em /api/admin/library-tools barra quem não é liberado", async () => {
    const r = await rodar(viaFetch("https://admin.pipeelo.com/api/admin/library-tools/1", limpo), porta);
    assert.strictEqual(r.stdout, "PIPEELO_TRAVA_TOOLS");
  });

  await t.test("#libera-tools de um liberado segue liberando a rota global", async () => {
    estado.comentarios = [{ id: "c1", authorUserId: ANDRE, body: "#libera-tools" }];
    const r = await rodar(viaHttp("/v1/tool/1", limpo, porta), porta);
    estado.comentarios = [];
    assert.strictEqual(r.stdout, "ENVIADO", r.stderr);
  });

  await t.test("aviso sai no stderr e não barra", async () => {
    const r = await rodar(viaHttp("/v1/custom-command/1", corpoDeTool("custom_area_x", "return 1;"), porta), porta);
    assert.strictEqual(r.stdout, "ENVIADO", r.stderr);
    assert.match(r.stderr, /PIPEELO_LINT_AVISO Regra 5/);
  });
});
