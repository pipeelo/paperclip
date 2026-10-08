"use strict";

const { comandoSuspeito, quemPediu, avisoDeBloqueio } = require("./trava.cjs");

async function decidir(entrada, opcoes = {}) {
  if (entrada.tool_name !== "Bash") return null;
  const comando = entrada.tool_input?.command || "";
  const suspeita = comandoSuspeito(comando, { cwd: entrada.cwd, home: process.env.HOME });
  if (!suspeita) return null;
  const quem = await quemPediu(opcoes);
  if (!quem.restrito) return null;
  return avisoDeBloqueio(quem, suspeita, opcoes.config);
}

module.exports = { decidir };

if (require.main === module) {
  let bruto = "";
  process.stdin.on("data", (d) => (bruto += d));
  process.stdin.on("end", async () => {
    let entrada;
    try {
      entrada = JSON.parse(bruto || "{}");
    } catch {
      process.exit(0);
    }
    const aviso = await decidir(entrada);
    if (aviso) {
      process.stderr.write(aviso);
      process.exit(2);
    }
    process.exit(0);
  });
}
