// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueClientFilter, clientFilterButtonLabel, filterClientOptions } from "./IssueClientFilter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div data-testid="conteudo">{children}</div>,
}));

const CLIENTES = [
  { id: "l-sol", name: "SOLUCAO NETWORK PROVEDOR LTDA", color: "#01d5ac" },
  { id: "l-cepain", name: "CEPAIN - INTERNET BANDA LARGA", color: "#01d5ac" },
  { id: "l-innon", name: "INNON", color: "#01d5ac" },
  { id: "l-conesul", name: "Rede ConeSul", color: "#01d5ac" },
];

describe("filterClientOptions", () => {
  it("ordena por nome e acha sem acento e sem maiúscula", () => {
    expect(filterClientOptions(CLIENTES, "").map((c) => c.id)).toEqual(["l-cepain", "l-innon", "l-conesul", "l-sol"]);
    expect(filterClientOptions(CLIENTES, "solução").map((c) => c.id)).toEqual(["l-sol"]);
    expect(filterClientOptions(CLIENTES, "  conesul ").map((c) => c.id)).toEqual(["l-conesul"]);
    expect(filterClientOptions(CLIENTES, "banda").map((c) => c.id)).toEqual(["l-cepain"]);
    expect(filterClientOptions(CLIENTES, "xyz")).toEqual([]);
  });
});

describe("clientFilterButtonLabel", () => {
  it("mostra Clientes, o nome ou a quantidade", () => {
    expect(clientFilterButtonLabel([], CLIENTES)).toBe("Clientes");
    expect(clientFilterButtonLabel(["l-innon"], CLIENTES)).toBe("INNON");
    expect(clientFilterButtonLabel(["l-innon", "l-sol"], CLIENTES)).toBe("2 clientes");
  });
});

describe("IssueClientFilter", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function render(selected: string[], onChange: (labels: string[]) => void) {
    const root = createRoot(container);
    act(() => {
      root.render(<IssueClientFilter options={CLIENTES} selected={selected} onChange={onChange} />);
    });
    return root;
  }

  it("filtra a lista pelo campo de busca e marca o cliente", () => {
    const onChange = vi.fn();
    const root = render([], onChange);
    const input = container.querySelector('input[aria-label="Buscar cliente"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "inno");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const opcoes = Array.from(container.querySelectorAll('[role="option"]'));
    expect(opcoes.map((o) => o.textContent)).toEqual(["INNON"]);
    act(() => {
      (opcoes[0] as HTMLButtonElement).click();
    });
    expect(onChange).toHaveBeenCalledWith(["l-innon"]);
    act(() => root.unmount());
  });

  it("desmarca o cliente já marcado e limpa tudo", () => {
    const onChange = vi.fn();
    const root = render(["l-innon", "l-sol"], onChange);
    const innon = Array.from(container.querySelectorAll('[role="option"]')).find((o) => o.textContent === "INNON") as HTMLButtonElement;
    expect(innon.getAttribute("aria-selected")).toBe("true");
    act(() => innon.click());
    expect(onChange).toHaveBeenLastCalledWith(["l-sol"]);
    const limpar = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Limpar")) as HTMLButtonElement;
    act(() => limpar.click());
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(container.textContent).toContain("2 selecionados");
    act(() => root.unmount());
  });

  it("avisa quando nenhum cliente bate com a busca", () => {
    const root = render([], vi.fn());
    const input = container.querySelector('input[aria-label="Buscar cliente"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "zzz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Nenhum cliente encontrado.");
    act(() => root.unmount());
  });
});
