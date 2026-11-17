import { useMemo, useState } from "react";
import { Building2, Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../lib/utils";
import { toggleIssueFilterValue } from "../lib/issue-filters";

export type ClientOption = {
  id: string;
  name: string;
  color: string;
};

export function normalizeClientSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filterClientOptions(options: ClientOption[], search: string): ClientOption[] {
  const term = normalizeClientSearch(search);
  const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  if (!term) return sorted;
  return sorted.filter((option) => normalizeClientSearch(option.name).includes(term));
}

export function clientFilterButtonLabel(selected: string[], options: ClientOption[]): string {
  if (selected.length === 0) return "Clientes";
  if (selected.length === 1) return options.find((option) => option.id === selected[0])?.name ?? "1 cliente";
  return `${selected.length} clientes`;
}

export function IssueClientFilter({
  options,
  selected,
  onChange,
}: {
  options: ClientOption[];
  selected: string[];
  onChange: (labels: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visible = useMemo(() => filterClientOptions(options, search), [options, search]);
  const active = selected.length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 max-w-[11rem] shrink-0 gap-1.5 px-2 text-xs", active && "border-primary/60 text-foreground")}
          aria-label="Filtrar por cliente"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden truncate sm:inline">{clientFilterButtonLabel(selected, options)}</span>
          {active ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground sm:hidden">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente..."
              aria-label="Buscar cliente"
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto overscroll-contain p-1" role="listbox" aria-multiselectable="true">
          {visible.length > 0 ? visible.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  isSelected ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/50",
                )}
                onClick={() => onChange(toggleIssueFilterValue(selected, option.id))}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          }) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</div>
          )}
        </div>
        {active ? (
          <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
            <span className="text-xs text-muted-foreground">
              {selected.length === 1 ? "1 selecionado" : `${selected.length} selecionados`}
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange([])}
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
