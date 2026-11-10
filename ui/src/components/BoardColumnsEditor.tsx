import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ISSUE_STATUSES, type InstanceGeneralSettings, type IssueStatus } from "@paperclipai/shared";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { instanceSettingsApi } from "../api/instanceSettings";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type BoardColumns = NonNullable<InstanceGeneralSettings["boardColumns"]>;

const NEW_LABEL_COLOR = "#6366f1";

const STATUS_NAMES: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  in_progress: "Em andamento",
  in_review: "Em revisão",
  done: "Concluída",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
};

export function BoardColumnsEditor({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<IssueStatus>("todo");

  const { data: settings } = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
    retry: false,
  });
  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(companyId),
    queryFn: () => issuesApi.listLabels(companyId),
  });
  const columns: BoardColumns = settings?.boardColumns ?? [];

  const save = useMutation({
    mutationFn: async (next: BoardColumns) => {
      const missing = next.filter((column) => !labels?.some((label) => label.name === column.name));
      for (const column of missing) {
        await issuesApi.createLabel(companyId, { name: column.name, color: NEW_LABEL_COLOR });
      }
      return instanceSettingsApi.updateGeneral({ boardColumns: next });
    },
    onSuccess: () => {
      setName("");
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId) }),
      ]);
    },
  });

  const trimmed = name.trim();
  const duplicated = columns.some((column) => column.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" data-pt-br="ignorar">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Colunas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3" data-pt-br="ignorar">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Colunas do quadro</h3>
          <p className="text-xs text-muted-foreground">
            A coluna nova aparece depois da etapa base. O card dela guarda uma etiqueta com o nome da coluna e o
            status da etapa base.
          </p>
        </div>

        {columns.length > 0 ? (
          <ul className="space-y-1">
            {columns.map((column) => (
              <li key={column.name} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{column.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{STATUS_NAMES[column.status]}</span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label={`Apagar a coluna ${column.name}`}
                  title="Apagar a coluna. Os cards voltam para a etapa base."
                  disabled={save.isPending}
                  onClick={() => save.mutate(columns.filter((other) => other.name !== column.name))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma coluna personalizada.</p>
        )}

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || duplicated) return;
            save.mutate([...columns, { name: trimmed, status }]);
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome da coluna"
            aria-label="Nome da coluna"
            maxLength={48}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Etapa base</span>
            <select
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={status}
              onChange={(event) => setStatus(event.target.value as IssueStatus)}
            >
              {ISSUE_STATUSES.map((option) => (
                <option key={option} value={option}>{STATUS_NAMES[option]}</option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" className="w-full gap-1.5" disabled={!trimmed || duplicated || save.isPending}>
            <Plus className="h-3.5 w-3.5" />
            Criar coluna
          </Button>
          {duplicated ? <p className="text-xs text-destructive">Já existe uma coluna com esse nome.</p> : null}
          {save.error ? (
            <p role="alert" className="text-xs text-destructive">
              Não deu para salvar. Só admin da instância muda as colunas.
            </p>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}
