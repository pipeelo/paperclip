"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PASTA = __dirname;
const MARCA_DEMANDA = "[trava-tools]";
const LIBERA = "#libera-tools";
const METODOS_QUE_MUDAM = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HOST_PIPEELO = /(^|\.)pipeelo\.com$/i;
const ROTA_DE_TOOL = /^\/(v1\/(custom-commands?|tools?|function-callings?|environments?)(\/|$)|api\/admin\/library-tools(\/|$))/i;
const ALVO_NO_TEXTO = /(\/v1\/(custom-commands?|tools?|function-callings?|environments?)\b(?!-)|\/api\/admin\/library-tools\b|update-tool-script)/i;
const SO_PAPERCLIP = /(PAPERCLIP_API_URL|easypanel\.host)/;
const HOST_NO_TEXTO = /pipeelo\.com/i;
const MUDANCA_NO_TEXTO = /(-X\s*['"]?(PUT|POST|PATCH|DELETE)\b|--request[\s=]+['"]?(PUT|POST|PATCH|DELETE)\b|method['"]?\s*[:=]\s*['"](PUT|POST|PATCH|DELETE)['"]|\.(put|post|patch|delete)\s*\(|\s(-d|--data[\w-]*|--json|-F|--form)[\s=]|update-tool-script)/i;
const MEXE_NA_TRAVA = /(NODE_OPTIONS|--require\b|\s-r\s+\S+\.c?js)/;
const CLIENTE_DIRETO = /\b(curl|wget|python[\d.]*)\b/i;
const ROTA_GLOBAL = /^\/(v1\/tools?(\/|$)|api\/admin\/library-tools(\/|$))/i;
const LEITURA = ["consultar", "listar", "buscar", "verificar", "ver"];
const ESCRITA = ["agendar", "criar", "cadastrar", "atualizar", "alterar", "cancelar", "abrir", "excluir", "registrar"];
const LE_KB = /\/knowledge[-_]base\b|\bknowledge[-_]base\//i;
const OBJETO_DEVOLVIDO = /(?:\breturn\b|JSON\.stringify\()\s*\(?\s*\{([^{}]*)/g;
const CHAVE_DE_DECISAO = /(?:^|,)\s*['"]?(agenda|id_agenda|tecnico|id_tecnico|id_tecnico_gestor|fila|departamento|slug)['"]?\s*(?::|,|$)/;
const NOME_EM_MAIUSCULAS = /^[A-ZÀ-Ý][A-ZÀ-Ý ]{2,}$/;
const PALAVRA_TECNICA = new Set(["NULL", "TRUE", "FALSE", "UNDEFINED", "GET", "POST", "PUT", "PATCH", "DELETE", "ERRO", "SIM", "NAO", "NÃO", "ATIVO", "INATIVO", "ATIVA", "INATIVA", "SUSPENSO", "CANCELADO", "BLOQUEADO", "PENDENTE", "ABERTO", "FECHADO", "ABERTA", "FECHADA", "PAGO", "VENCIDO", "ACTIVE", "INACTIVE", "PENDING", "OPEN", "CLOSED"]);
const ARQUIVO_NO_COMANDO = /(?:^|[\s'"=])((?:~|\.{1,2}|\/)?[\w@.\/~+-]*\.(?:m?js|cjs|ts|py|sh))(?=$|[\s'";|&)])/g;

function lerConfig() {
  return JSON.parse(fs.readFileSync(path.join(PASTA, "config.json"), "utf8"));
}

function mudaTool(metodo, url) {
  if (!METODOS_QUE_MUDAM.has(String(metodo || "GET").toUpperCase())) return false;
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return false;
  }
  return HOST_PIPEELO.test(u.hostname) && ROTA_DE_TOOL.test(u.pathname);
}

function textoMudaTool(texto) {
  if (SO_PAPERCLIP.test(texto) && !HOST_NO_TEXTO.test(texto)) return false;
  return ALVO_NO_TEXTO.test(texto) && MUDANCA_NO_TEXTO.test(texto);
}

function arquivosDoComando(comando, cwd, home) {
  const achados = new Set();
  for (const m of String(comando).matchAll(ARQUIVO_NO_COMANDO)) {
    let p = m[1];
    if (p.startsWith("~")) p = path.join(home || "", p.slice(1));
    achados.add(path.resolve(cwd || process.cwd(), p));
  }
  return [...achados];
}

function comandoSuspeito(comando) {
  return MEXE_NA_TRAVA.test(String(comando || "")) ? "o comando mexe na trava de tools" : null;
}

function escritaDireta(comando, { cwd, home, ler = (p) => fs.readFileSync(p, "utf8") } = {}) {
  const texto = String(comando || "");
  if (textoMudaTool(texto) && CLIENTE_DIRETO.test(texto)) return "o comando grava tool, função ou environment por curl ou python";
  for (const arquivo of arquivosDoComando(texto, cwd, home)) {
    let conteudo;
    try {
      if (fs.statSync(arquivo).size > 1024 * 1024) continue;
      conteudo = ler(arquivo);
    } catch {
      continue;
    }
    if (textoMudaTool(conteudo) && (/\.(py|sh)$/i.test(arquivo) || CLIENTE_DIRETO.test(conteudo))) {
      return `o script ${arquivo} grava tool, função ou environment por curl ou python`;
    }
  }
  return null;
}

function lerCorpo(texto) {
  try {
    const o = JSON.parse(texto);
    if (o && typeof o === "object") return o;
  } catch {}
  return { script: String(texto || "") };
}

function rotaGlobal(url, texto) {
  const caminho = new URL(String(url)).pathname;
  if (!ROTA_GLOBAL.test(caminho)) return false;
  return /^\/api\//i.test(caminho) || String(lerCorpo(texto).type || "LIBRARY").toUpperCase() === "LIBRARY";
}

function comecaCom(palavra, verbos) {
  const p = String(palavra || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return verbos.some((v) => p === v || p.startsWith(`${v}_`));
}

function linhaDe(texto, i) {
  const fim = texto.indexOf("\n", i);
  return texto.slice(texto.lastIndexOf("\n", i) + 1, fim < 0 ? undefined : fim).trim().slice(0, 160);
}

function nomesEmMaiusculas(lista) {
  return lista.map((s) => s.trim()).filter((s) => NOME_EM_MAIUSCULAS.test(s) && !PALAVRA_TECNICA.has(s));
}

function dentroDeFuncaoInterna(script) {
  const principais = new Set([...(script.match(/^return\b[^\n]*/m)?.[0] || "").matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  const pilha = [];
  const marca = new Uint8Array(script.length);
  for (let i = 0; i < script.length; i++) {
    marca[i] = pilha.includes(true) ? 1 : 0;
    if (script[i] === "}") pilha.pop();
    if (script[i] !== "{") continue;
    const antes = script.slice(Math.max(0, i - 200), i);
    const declarada = antes.match(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)[^{;]*$/);
    const iife = pilha.length === 0 && /^\s*return\s*\(\s*(async\s*)?(\(\s*\)\s*=>|function\s*\(\s*\))\s*$/m.test(antes.split("\n").pop());
    pilha.push(/=>\s*$|\bfunction\b[^{]*$/.test(antes) && !iife && !(declarada && principais.has(declarada[1])));
  }
  return marca;
}

function lintar(texto, config = lerConfig()) {
  const corpo = lerCorpo(texto);
  const funcao = corpo.function_calling || {};
  const nome = String(funcao.name || corpo.name || "");
  const curto = nome.replace(/^custom_/i, "");
  const script = typeof corpo.script === "string" ? corpo.script : "";
  const achados = [];

  const kb = script.match(LE_KB);
  if (kb) {
    achados.push({ regra: 1, barra: true, texto: `Regra 1 (o script lê KB): achei \`${linhaDe(script, kb.index)}\`. Corrija: o script não lê KB. A regra de decisão fica no prompt do agente. Dado fixo fica no próprio script ou num environment.` });
  }

  for (const [campo, def] of Object.entries((funcao.parameters || corpo.parameters || {}).properties || {})) {
    const valores = Array.isArray(def?.enum) ? def.enum : [];
    if (valores.some((v) => comecaCom(v, LEITURA)) && valores.some((v) => comecaCom(v, ESCRITA))) {
      achados.push({ regra: 2, barra: true, texto: `Regra 2 (uma função lê e grava): o campo \`${campo}\` aceita ${JSON.stringify(valores)}. Corrija: separe em duas funções, uma de leitura (consultar_...) e uma de escrita (agendar_...).` });
    }
  }

  if (comecaCom(curto, ["consultar", "buscar", "verificar", "listar"])) {
    const interna = dentroDeFuncaoInterna(script);
    for (const m of script.matchAll(OBJETO_DEVOLVIDO)) {
      const chave = m[1].match(CHAVE_DE_DECISAO);
      if (!chave || interna[m.index]) continue;
      achados.push({ regra: 3, barra: true, texto: `Regra 3 (função de leitura devolve decisão): achei a chave \`${chave[1]}\` em \`${linhaDe(script, m.index)}\`. Corrija: a função de leitura devolve só fatos. Quem escolhe agenda, técnico, fila ou departamento é o agente (prompt) ou a função de escrita.` });
      break;
    }
  }

  const listas = [
    ...[...script.matchAll(/\[([^[\]]*)\]/g)].map((m) => nomesEmMaiusculas([...m[1].matchAll(/(['"`])((?:(?!\1)[^\\\n])*)\1/g)].map((s) => s[2]))),
    ...[...script.matchAll(/\{([^{}]*)\}/g)].map((m) => nomesEmMaiusculas([...m[1].matchAll(/(?:^|[,\s])(['"]?)([^'"\n,:{}]+)\1\s*:/g)].map((s) => s[2]))),
  ];
  const grande = listas.find((l) => l.length >= 5);
  if (grande) {
    achados.push({ regra: 4, barra: false, texto: `Regra 4 (lista grande de nomes no script): ${grande.length} nomes (${grande.slice(0, 5).join(", ")}...). Lista de nomes que muda com o tempo fica fora do script.` });
  }

  if (nome && !comecaCom(curto, [...LEITURA, ...ESCRITA])) {
    achados.push({ regra: 5, barra: false, texto: `Regra 5 (nome sem verbo claro): ${nome}. Comece o nome por um verbo de leitura (${LEITURA.join("_, ")}_) ou de escrita (${ESCRITA.join("_, ")}_).` });
  }

  const excecoes = config.excecoesLint || [];
  const valem = achados.filter((a) => !excecoes.some((e) => e.funcao === nome && Number(e.regra) === a.regra));
  return { nome, erros: valem.filter((a) => a.barra), avisos: valem.filter((a) => !a.barra) };
}

function avisoDeLint(lint, oQue, config = lerConfig()) {
  return [
    `BLOQUEADO pelo lint da trava: ${oQue}${lint.nome ? ` (${lint.nome})` : ""}.`,
    ...lint.erros.map((e) => e.texto),
    `Corrija e grave de novo pela skill com node. Exceção a uma regra só ${config.responsavel.nome} dá (excecoesLint no config.json).`,
  ].join("\n");
}

function idsDoTexto(texto) {
  const ids = [];
  for (const m of String(texto || "").matchAll(/Pedido por: ([^\n()]*)\(([A-Za-z0-9_-]{8,})\)/g)) ids.push({ id: m[2], nome: m[1].trim() });
  return ids;
}

function pessoaDoChat(textoDoPedido) {
  const primeira = String(textoDoPedido || "").split("\n")[0];
  const m = primeira.match(/^\[chat\] pessoa: (.*) \(id ([A-Za-z0-9_-]+)\)\s*$/);
  return m ? { id: m[2], nome: m[1].trim() } : null;
}

function criarApi({ url, chave, fetchFn }) {
  const base = String(url || "").replace(/\/+$/, "");
  return async function pedir(rota, opcoes = {}) {
    const res = await fetchFn(`${base}/api${rota}`, {
      ...opcoes,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}`, ...(opcoes.headers || {}) },
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`${rota} respondeu ${res.status}: ${texto.slice(0, 200)}`);
    return texto ? JSON.parse(texto) : null;
  };
}

function autorDoComentario(c) {
  return c.authorUserId || (c.authorType === "user" ? c.author?.id || c.userId : null) || null;
}

async function quemPediu({ env = process.env, fetchFn = globalThis.fetch, lerArquivo = (p) => fs.readFileSync(p, "utf8"), config = lerConfig() } = {}) {
  const runId = env.PAPERCLIP_RUN_ID;
  if (!runId) return { restrito: false, pessoas: [], motivo: "fora de um run do Paperclip" };
  const liberados = new Set(config.liberados.map((p) => p.id));
  try {
    const pedir = criarApi({ url: env.PAPERCLIP_API_URL, chave: env.PAPERCLIP_API_KEY, fetchFn });
    const run = await pedir(`/heartbeat-runs/${encodeURIComponent(runId)}`);
    const ctx = run.contextSnapshot || {};
    const pessoas = [];
    let precisaLiberar = false;

    const taskKey = String(ctx.taskKey || "");
    if (taskKey.startsWith(config.prefixoChat)) {
      const pessoa = pessoaDoChat(lerArquivo(path.join(config.pastaChat, `${taskKey}.md`)));
      if (!pessoa) throw new Error("não achei a pessoa do chat");
      pessoas.push(pessoa);
    }

    const issueId = ctx.issueId || ctx.taskId || env.PAPERCLIP_TASK_ID || null;
    let comentarios = [];
    if (issueId) {
      let atual = issueId;
      for (let i = 0; atual && i < 10; i++) {
        const issue = await pedir(`/issues/${encodeURIComponent(atual)}`);
        if (issue.createdByUserId) pessoas.push({ id: issue.createdByUserId, nome: "" });
        pessoas.push(...idsDoTexto(issue.description));
        if (String(issue.description || "").includes(MARCA_DEMANDA)) precisaLiberar = true;
        atual = issue.parentId || null;
      }
      const lista = await pedir(`/issues/${encodeURIComponent(issueId)}/comments`);
      comentarios = Array.isArray(lista) ? lista : lista?.comments || [];
      const idDoComentario = ctx.wakeCommentId || ctx.commentId || env.PAPERCLIP_WAKE_COMMENT_ID;
      const quemComentou = idDoComentario ? comentarios.find((c) => c.id === idDoComentario) : null;
      if (quemComentou && autorDoComentario(quemComentou)) pessoas.push({ id: autorDoComentario(quemComentou), nome: "" });
    }

    const liberou = comentarios.some((c) => liberados.has(autorDoComentario(c)) && String(c.body || "").toLowerCase().includes(LIBERA));
    const barrados = pessoas.filter((p) => !liberados.has(p.id));
    if (liberou) return { restrito: false, pessoas, motivo: `um liberado comentou ${LIBERA}` };
    if (barrados.length) return { restrito: true, pessoas: barrados, motivo: "pedido de pessoa sem permissão para mudar tool" };
    if (precisaLiberar) return { restrito: true, pessoas, motivo: `demanda da trava sem o comentário ${LIBERA} de um liberado` };
    return { restrito: false, pessoas, motivo: "nenhuma pessoa sem permissão no pedido" };
  } catch (e) {
    return { restrito: true, pessoas: [], motivo: `não confirmei quem pediu (${e.message})` };
  }
}

function avisoDeBloqueio(quem, oQue, config = lerConfig()) {
  const nomes = quem.pessoas.map((p) => p.nome || p.id).filter(Boolean);
  const responsavel = config.responsavel.nome;
  return [
    `BLOQUEADO pela trava de tools: ${oQue}.`,
    `Motivo: ${quem.motivo}${nomes.length ? ` (${[...new Set(nomes)].join(", ")})` : ""}.`,
    `Só ${responsavel} muda tool global (LIBRARY) da Pipeelo. Não tente outro caminho (curl, python, script novo, painel).`,
    "Faça assim:",
    `1. Escreva com a ferramenta Write um arquivo .md com o pedido, a causa achada, a mudança proposta e a tool com a versão.`,
    `2. Abra a demanda para ${responsavel}: node ${path.join(PASTA, "demanda.cjs")} --titulo "<tenant>: <o que mudar>" --arquivo <caminho do .md>`,
    "3. Responda a quem pediu com o link da demanda, em 1 linha.",
    "4. Se este run é de uma task, comente o link nela e marque a task como done.",
  ].join("\n");
}

module.exports = {
  MARCA_DEMANDA,
  LIBERA,
  lerConfig,
  mudaTool,
  textoMudaTool,
  comandoSuspeito,
  escritaDireta,
  rotaGlobal,
  lintar,
  avisoDeLint,
  pessoaDoChat,
  idsDoTexto,
  quemPediu,
  avisoDeBloqueio,
  criarApi,
};

if (require.main === module && process.argv[2] === "--quem") {
  quemPediu().then((q) => process.stdout.write(JSON.stringify(q)));
}
