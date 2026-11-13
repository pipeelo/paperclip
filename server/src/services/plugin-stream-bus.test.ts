import { describe, expect, it } from "vitest";
import { createPluginStreamBus, encaminharParaStreamBus } from "./plugin-stream-bus.js";

describe("encaminharParaStreamBus", () => {
  it("entrega o emit do worker a quem assina o canal da empresa", () => {
    const bus = createPluginStreamBus();
    const recebidos: Array<{ evento: unknown; tipo: string }> = [];
    bus.subscribe("plugin-1", "eventos", "empresa-1", (evento, tipo) => recebidos.push({ evento, tipo }));
    const encaminhar = encaminharParaStreamBus(bus, "plugin-1");

    encaminhar("streams.open", { channel: "eventos", companyId: "empresa-1" });
    encaminhar("streams.emit", { channel: "eventos", companyId: "empresa-1", event: { seq: 1 } });
    encaminhar("streams.close", { channel: "eventos", companyId: "empresa-1" });

    expect(recebidos).toEqual([
      { evento: {}, tipo: "open" },
      { evento: { seq: 1 }, tipo: "message" },
      { evento: {}, tipo: "close" },
    ]);
  });

  it("não entrega para outra empresa nem para outro plugin", () => {
    const bus = createPluginStreamBus();
    const recebidos: unknown[] = [];
    bus.subscribe("plugin-1", "eventos", "empresa-2", (e) => recebidos.push(e));
    bus.subscribe("plugin-2", "eventos", "empresa-1", (e) => recebidos.push(e));

    encaminharParaStreamBus(bus, "plugin-1")("streams.emit", { channel: "eventos", companyId: "empresa-1", event: { seq: 1 } });

    expect(recebidos).toEqual([]);
  });

  it("ignora aviso sem canal", () => {
    const bus = createPluginStreamBus();
    const recebidos: unknown[] = [];
    bus.subscribe("plugin-1", "", "empresa-1", (e) => recebidos.push(e));

    encaminharParaStreamBus(bus, "plugin-1")("streams.emit", { companyId: "empresa-1", event: {} });

    expect(recebidos).toEqual([]);
  });
});
