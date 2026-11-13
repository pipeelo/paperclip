import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [
    {
      code: "jarvis_whatsapp_remote_session",
      level: "info",
      message: "O run fica aberto até a sessão do Jarvis do WhatsApp chamar fim no plugin pipeelo.jarvis-eventos.",
    },
  ];
  return {
    adapterType: ctx.adapterType,
    status: "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
