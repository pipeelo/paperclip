import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const jarvisWhatsappAdapter: ServerAdapterModule = {
  type: "jarvis_whatsapp",
  execute,
  testEnvironment,
  models: [],
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: `# jarvis_whatsapp agent configuration

Adapter: jarvis_whatsapp

Core fields:
- baseUrl (string, optional): Paperclip API base URL, default from PAPERCLIP_RUNTIME_API_URL, PAPERCLIP_API_URL or localhost
- pluginKey (string, optional): plugin key, default pipeelo.jarvis-eventos
- pollMs (number, optional): poll interval in milliseconds, default 5000
- timeoutSec (number, optional): maximum run duration in seconds, default 5400
`,
};
