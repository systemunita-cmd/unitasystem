"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 👥 useEquipeFiltro + <EquipeSelector /> — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// Adaptado pra single-tenant: NÃO precisa de workspaceId.
// Lê equipes globais da tabela `equipes` (sem filtro de workspace).
//
// COMPATIBILIDADE: o hook aceita um parâmetro `workspaceId` opcional só
// pra não quebrar imports do Wolf — mas ignora ele internamente.
//
// USO:
//   const { equipes, equipeId, setEquipeId, EquipeSelector } = useEquipeFiltro();
//   <EquipeSelector />
//   const propsDaEquipe = propostas.filter(p => !equipeId || p.equipe_id === equipeId);
// ═══════════════════════════════════════════════════════════════════════

export type Equipe = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  created_at: string;
};

const LS_KEY = "equipe_filtro_v1__unita";

export function useEquipeFiltro(_workspaceId?: string) {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipeId, setEquipeIdState] = useState<string>("");
  const [carregando, setCarregando] = useState(false);

  // Carrega da localStorage uma vez
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(LS_KEY);
    if (stored) setEquipeIdState(stored);
  }, []);

  // Setter que persiste
  const setEquipeId = useCallback((id: string) => {
    setEquipeIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    }
  }, []);

  // Fetch das equipes (todas, sem filtro de workspace)
  const fetchEquipes = useCallback(async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("equipes")
        .select("*")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (!error && data) setEquipes(data as Equipe[]);
    } catch {
      // Tabela não existe ainda → simplesmente sem equipes
    }
    setCarregando(false);
  }, []);

  useEffect(() => { fetchEquipes(); }, [fetchEquipes]);

  // Realtime — atualiza quando equipe é criada/editada
  useEffect(() => {
    const ch = supabase.channel("equipes_rt_unita")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "equipes" },
        () => fetchEquipes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchEquipes]);

  // Se a equipe selecionada foi removida, volta pra "todas"
  useEffect(() => {
    if (!equipeId) return;
    if (equipes.length > 0 && !equipes.find(e => e.id === equipeId)) {
      setEquipeId("");
    }
  }, [equipes, equipeId, setEquipeId]);

  const equipeSelecionada = equipes.find(e => e.id === equipeId) || null;

  // ─── Componente <EquipeSelector /> — cores azuis Unita 🔵 ───────────
  const EquipeSelector = ({
    mostrarSeVazio = false,
    estilo,
  }: {
    mostrarSeVazio?: boolean;
    estilo?: React.CSSProperties;
  }) => {
    if (!mostrarSeVazio && equipes.length === 0) return null;

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: equipeId ? "#eff6ff" : "#ffffff",
        border: `1px solid ${equipeId ? "#bfdbfe" : "#e5e7eb"}`,
        borderRadius: 12, padding: "6px 12px 6px 14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "all 0.15s",
        ...estilo,
      }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>👥</span>
        <span style={{
          color: "#6b7280", fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 0.5,
          whiteSpace: "nowrap",
        }}>
          Equipe
        </span>
        <select
          value={equipeId}
          onChange={(e) => setEquipeId(e.target.value)}
          style={{
            background: "transparent", border: "none", outline: "none",
            color: equipeId ? "#2563eb" : "#1f2937",
            fontSize: 13, fontWeight: 700,
            cursor: equipes.length === 0 ? "not-allowed" : "pointer",
            padding: "4px 0", minWidth: 140,
          }}
          disabled={equipes.length === 0}
        >
          <option value="">🌐 Todas as equipes</option>
          {equipes.map(eq => (
            <option key={eq.id} value={eq.id}>{eq.nome}</option>
          ))}
        </select>
      </div>
    );
  };

  return {
    equipes,
    equipeId,
    equipeSelecionada,
    setEquipeId,
    carregando,
    EquipeSelector,
    refetch: fetchEquipes,
  };
}