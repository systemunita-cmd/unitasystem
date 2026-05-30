"use client";
import { createContext, useContext, useState, useRef, useCallback, ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🍞 SISTEMA DE TOAST GLOBAL — UnitaSystem
// ═══════════════════════════════════════════════════════════════════════
// Uso em qualquer componente:
//
//   import { useToast } from "@/hooks/useToast";
//
//   const { notify } = useToast();
//   notify("Salvo com sucesso!", "sucesso");
//   notify("Falha ao salvar", "erro", "Tente novamente");
//
// IMPORTANTE: <ToastProvider> precisa envolver a árvore React no
// app/layout.tsx pra funcionar.
// ═══════════════════════════════════════════════════════════════════════

export type TipoToast = "sucesso" | "erro" | "aviso" | "info";

export type Toast = {
  id: number;
  msg: string;
  tipo: TipoToast;
  subMsg?: string;
};

type ToastContextValue = {
  notify: (msg: string, tipo?: TipoToast, subMsg?: string) => void;
  remover: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACAO_POR_TIPO: Record<TipoToast, number> = {
  info: 3500,
  sucesso: 3500,
  aviso: 5000,
  erro: 6000,
};

// Cores adaptadas pro Unita: info usa azul Unita
const CORES_POR_TIPO: Record<TipoToast, { bg: string; border: string; icon: string }> = {
  sucesso: { bg: "#10b981", border: "#059669", icon: "✅" },
  erro:    { bg: "#dc2626", border: "#b91c1c", icon: "❌" },
  aviso:   { bg: "#f59e0b", border: "#d97706", icon: "⚠️" },
  info:    { bg: "#2563eb", border: "#1e40af", icon: "ℹ️" }, // 🔵 azul Unita
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const remover = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const notify = useCallback((msg: string, tipo: TipoToast = "info", subMsg?: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, tipo, subMsg }]);
    const duracao = DURACAO_POR_TIPO[tipo];
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duracao);
  }, []);

  return (
    <ToastContext.Provider value={{ notify, remover }}>
      {children}
      <Toaster toasts={toasts} remover={remover} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: se usado fora do Provider, loga no console
    return {
      notify: (msg, tipo = "info", subMsg) => {
        const prefix = { sucesso: "✅", erro: "❌", aviso: "⚠️", info: "ℹ️" }[tipo];
        console.warn(`[useToast sem Provider] ${prefix} ${msg}${subMsg ? " — " + subMsg : ""}`);
      },
      remover: () => {},
    };
  }
  return ctx;
}

// ─── Renderiza os toasts (fixed canto inferior direito) ──────────────
function Toaster({ toasts, remover }: { toasts: Toast[]; remover: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes unitaToastIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 380,
        pointerEvents: "none",
      }}>
        {toasts.map(t => {
          const cor = CORES_POR_TIPO[t.tipo];
          return (
            <div
              key={t.id}
              onClick={() => remover(t.id)}
              style={{
                background: cor.bg,
                border: `1px solid ${cor.border}`,
                borderRadius: 10,
                padding: "12px 16px",
                color: "white",
                fontSize: 13,
                lineHeight: 1.4,
                fontFamily: "Arial, sans-serif",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                cursor: "pointer",
                pointerEvents: "auto",
                animation: "unitaToastIn 0.25s ease-out",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
              title="Clique pra fechar"
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{cor.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: "bold", wordWrap: "break-word" }}>{t.msg}</div>
                {t.subMsg && (
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9, wordWrap: "break-word" }}>
                    {t.subMsg}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}