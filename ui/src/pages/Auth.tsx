import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { getRememberedInvitePath } from "../lib/invite-memory";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";

type AuthMode = "sign_in" | "sign_up";

const FIELD_CLASS =
  "w-full rounded-md border border-[#1E293B] bg-[#111827] px-4 py-3 text-[15px] text-[#F8FAFC] outline-none transition-colors placeholder:text-[#64748B] focus:border-[#00D2A0]";

const PIPEELO_SPRITES = [
  [
    "    ▄▄██████▄     ",
    "  ▄█████████ ██▄  ",
    " ███████▀   █████ ",
    "█████▀       █████",
    "█████▀  ▀▄  ██████",
    "█████       ██████",
    " ████▄   ▄███████ ",
    "  ▀█▀▄█████████▀  ",
    "     ▀██████▀▀    ",
  ],
  [
    "   ▄█████▄                                                    ",
    " ▄█████▀▀▄██▄  ▄▄▄▄▄  ▄▄▄ ▄▄▄▄▄▄  ▄▄▄▄▄  ▄▄▄▄▄▄ ▄▄     ▄▄▄▄▄  ",
    "████▀▀   ▀███  ██▀▀██ ███ ███▀██▄ ██▀▀▀  ██▀▀▀  ██    ███▀▀██▄",
    "████     ████  ██▄███ ███ ███▄██▀ █████  █████  ██    ██    ██",
    "████    ▄████  ██▀▀   ███ ███▀    ██▄▄▄  ██▄▄▄  ██▄▄▄ ▀██▄▄██▀",
    " ▀██▄▄██████▀  ▀▀     ▀▀▀ ▀▀▀     ▀▀▀▀▀▀ ▀▀▀▀▀▀ ▀▀▀▀▀  ▀▀▀▀▀  ",
    "    █████▀▀                                                   ",
  ],
] as const;

export function AuthPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(
    () => searchParams.get("next") || getRememberedInvitePath() || "/",
    [searchParams],
  );
  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session) {
      navigate(nextPath, { replace: true });
    }
  }, [session, navigate, nextPath]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Não deu para entrar. Confira o e-mail e a senha.");
    },
  });

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (mode === "sign_in" || (name.trim().length > 0 && password.trim().length >= 8));

  if (isSessionLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#090E17]">
        <p className="text-sm text-[#94A3B8]">Carregando…</p>
      </div>
    );
  }

  return (
    <main
      className="fixed inset-0 grid overflow-y-auto bg-[#090E17] text-[#F8FAFC] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
      style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        precedence="default"
      />
      <section className="flex min-h-full flex-col justify-between px-6 py-10 sm:px-12 lg:px-16">
        <img src="/pipeelo-logo.webp" alt="Pipeelo" className="h-7 w-auto self-start" />

        <div className="w-full max-w-sm py-12">
          <h1 className="text-[40px] font-bold leading-[1.1] tracking-[-0.02em]">
            {mode === "sign_in" ? "Tarefas" : "Criar conta"}
          </h1>
          <p className="mt-3 text-[#94A3B8]">
            {mode === "sign_in"
              ? "Entre com o e-mail e a senha da sua conta no Paperclip da Pipeelo."
              : "Crie a sua conta no Paperclip da Pipeelo. A senha precisa de 8 caracteres ou mais."}
          </p>

          <form
            className="mt-10 space-y-5"
            method="post"
            action={mode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (mutation.isPending) return;
              if (!canSubmit) {
                setError("Preencha todos os campos.");
                return;
              }
              mutation.mutate();
            }}
          >
            {mode === "sign_up" && (
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium">Nome</label>
                <input
                  id="name"
                  name="name"
                  className={FIELD_CLASS}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  autoFocus
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium">E-mail</label>
              <input
                id="email"
                name="email"
                className={FIELD_CLASS}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus={mode === "sign_in"}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium">Senha</label>
              <input
                id="password"
                name="password"
                className={FIELD_CLASS}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              />
            </div>
            {error && <p role="alert" className="text-sm text-[#F87171]">{error}</p>}
            <button
              type="submit"
              disabled={mutation.isPending}
              aria-disabled={!canSubmit || mutation.isPending}
              className="inline-flex w-full items-center justify-center rounded-md bg-[#00D2A0] px-5 py-3 text-sm font-semibold text-[#090E17] transition hover:shadow-[0_0_20px_#00d2a04d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00D2A0] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              {mutation.isPending ? "Entrando…" : mode === "sign_in" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        </div>

        <p className="text-xs text-[#64748B]">
          {mode === "sign_in" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
          <button
            type="button"
            className="font-medium text-[#F8FAFC] underline underline-offset-2"
            onClick={() => {
              setError(null);
              setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            }}
          >
            {mode === "sign_in" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-[#1E293B]/60 bg-[#0F172A]/40 lg:block">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 top-1/4 h-[520px] w-[520px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124, 58, 237, 0.16) 0%, rgba(9, 14, 23, 0) 70%)" }}
        />
        <div className="absolute inset-0">
          <AsciiArtAnimation sprites={PIPEELO_SPRITES} className="text-[#00D2A0]/55" />
        </div>
      </aside>
    </main>
  );
}
