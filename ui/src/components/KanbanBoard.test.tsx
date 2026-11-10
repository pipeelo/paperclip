// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue } from "@paperclipai/shared";
import { KanbanBoard } from "./KanbanBoard";

const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((event: unknown) => void),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: unknown) => void }) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  DragOverlay: () => null,
  PointerSensor: class {},
  useSensor: () => null,
  useSensors: () => [],
  useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => undefined, isOver: false, id }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock("./StatusIcon", () => ({
  StatusIcon: ({ status }: { status: string }) => <span data-column={status} />,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const issue = { id: "issue-1", identifier: "PAP-1", title: "Card", status: "todo", priority: "medium" } as unknown as Issue;

function columnOf(container: HTMLElement, identifier: string): string | null {
  const link = container.querySelector(`a[href="/issues/${identifier}"]`);
  return link?.closest("div.flex.flex-col.shrink-0")?.querySelector("[data-column]")?.getAttribute("data-column") ?? null;
}

function totalOf(container: HTMLElement, status: string): string | null {
  const column = container.querySelector(`[data-column="${status}"]`)?.closest("div.flex.flex-col.shrink-0");
  return column?.querySelector("span.tabular-nums")?.textContent ?? null;
}

describe("KanbanBoard", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("moves the card right away and puts it back when the update fails", async () => {
    let fail: (reason: Error) => void = () => undefined;
    const onUpdateIssue = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; }));

    act(() => {
      root.render(<KanbanBoard issues={[issue]} columnTotals={{ todo: 1, done: 0 }} onUpdateIssue={onUpdateIssue} />);
    });
    expect(columnOf(container, "PAP-1")).toBe("todo");

    act(() => dnd.onDragEnd?.({ active: { id: "issue-1" }, over: { id: "done" } }));

    expect(onUpdateIssue).toHaveBeenCalledWith("issue-1", { status: "done" });
    expect(columnOf(container, "PAP-1")).toBe("done");
    expect(totalOf(container, "todo")).toBe("0");
    expect(totalOf(container, "done")).toBe("1");

    await act(async () => {
      fail(new Error("offline"));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(columnOf(container, "PAP-1")).toBe("todo");
    expect(totalOf(container, "todo")).toBe("1");
  });

  it("shows a custom column after its base status and moves cards by label", () => {
    const onUpdateIssue = vi.fn(() => new Promise<void>(() => undefined));
    const waiting = { ...issue, id: "issue-2", identifier: "PAP-2", status: "blocked", labelIds: ["label-1", "label-9"] } as unknown as Issue;
    const titleOf = (identifier: string) =>
      container.querySelector(`a[href="/issues/${identifier}"]`)?.closest("div.flex.flex-col.shrink-0")?.querySelector("span.uppercase")?.textContent;

    act(() => {
      root.render(
        <KanbanBoard
          issues={[issue, waiting]}
          customColumns={[{ name: "Aguardando cliente", status: "blocked", labelId: "label-1" }]}
          columnTotals={{ todo: 1, blocked: 1 }}
          onUpdateIssue={onUpdateIssue}
        />,
      );
    });
    expect(titleOf("PAP-2")).toBe("Aguardando cliente");
    expect(titleOf("PAP-1")).toBe("Todo");
    expect(totalOf(container, "blocked")).toBe("0");

    act(() => dnd.onDragEnd?.({ active: { id: "issue-1" }, over: { id: "label:label-1" } }));
    expect(onUpdateIssue).toHaveBeenLastCalledWith("issue-1", { status: "blocked", labelIds: ["label-1"] });
    expect(titleOf("PAP-1")).toBe("Aguardando cliente");

    act(() => dnd.onDragEnd?.({ active: { id: "issue-2" }, over: { id: "blocked" } }));
    expect(onUpdateIssue).toHaveBeenLastCalledWith("issue-2", { labelIds: ["label-9"] });
    expect(titleOf("PAP-2")).toBe("Blocked");
  });
});
