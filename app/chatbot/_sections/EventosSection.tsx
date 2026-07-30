"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Regra = {
  id: number;
  evento: string;
  valor_gatilho: string | null;
  nome: string;
  canal_id: number | null;
  tipo: string;
  mensagem: string | null;
  ativo: boolean;
};
type Evento = {
  id: number;
  evento: string;
  valor_gatilho: string | null;
  status: string;
  erro: string | null;
  created_at: string;
  payload?: { nome?: string };
};
type Canal = { id: number; nome: string; tipo: string; status: string };

const MODULOS = ["CRM", "COBRANÇA", "SUPORTE", "ACOMPANHAMENTO"];
const CORES: Record<string, string> = {
  CRM: "#2563eb", COBRANÇA: "#16a34a", SUPORTE: "#8b5cf6", ACOMPANHAMENTO: "#ea580c",
};
const modulo = (evento: string) => evento.startsWith("crm.") ? "CRM"
  : evento.startsWith("cobranca.") ? "COBRANÇA"
  : evento.startsWith("suporte.") ? "SUPORTE" : "ACOMPANHAMENTO";

function statusVisual(status: string) {
  if (status === "enfileirado") return { color: "#166534", background: "#dcfce7" };
  if (status === "erro") return { color: "#991b1b", background: "#fee2e2" };
  if (status === "ignorado") return { color: "#475569", background: "#f1f5f9" };
  return { color: "#92400e", background: "#fef3c7" };
}

export function EventosSection() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [editando, setEditando] = useState<Regra | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [canalId, setCanalId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = async () => {
    const [r, e, c] = await Promise.all([
      supabase.from("automacao_regras").select("*").order("evento").order("valor_gatilho"),
      supabase.from("automacao_eventos").select("id,evento,valor_gatilho,status,erro,created_at,payload").order("created_at", { ascending: false }).limit(50),
      supabase.from("conexoes").select("id,nome,tipo,status").in("tipo", ["webjs", "waba"]).order("nome"),
    ]);
    if (r.error) setAviso(r.error.message);
    setRegras((r.data || []) as Regra[]);
    setEventos((e.data || []) as Evento[]);
    setCanais((c.data || []) as Canal[]);
  };

  useEffect(() => {
    carregar();
    const realtime = supabase.channel("automacao_eventos_painel")
      .on("postgres_changes", { event: "*", schema: "public", table: "automacao_eventos" }, carregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "automacao_regras" }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(realtime); };
  }, []);

  const grupos = useMemo(() => MODULOS.map(nome => ({
    nome, regras: regras.filter(regra => modulo(regra.evento) === nome),
  })), [regras]);

  const abrir = (regra: Regra) => {
    setEditando(regra);
    setMensagem(regra.mensagem || "");
    setCanalId(regra.canal_id ? String(regra.canal_id) : "");
    setAviso("");
  };

  const alternar = async (regra: Regra) => {
    if (!regra.ativo && !regra.canal_id) {
      abrir(regra);
      setAviso("Selecione um canal antes de ativar esta automação.");
      return;
    }
    const { error } = await supabase.from("automacao_regras")
      .update({ ativo: !regra.ativo, updated_at: new Date().toISOString() })
      .eq("id", regra.id);
    setAviso(error ? error.message : regra.ativo ? "Automação pausada." : "Automação ativada.");
    carregar();
  };

  const salvar = async () => {
    if (!editando || !canalId || !mensagem.trim()) return setAviso("Informe o canal e a mensagem.");
    setSalvando(true);
    const canal = canais.find(item => String(item.id) === canalId);
    const { error } = await supabase.from("automacao_regras").update({
      canal_id: Number(canalId),
      tipo: canal?.tipo || "webjs",
      mensagem: mensagem.trim(),
      updated_at: new Date().toISOString(),
    }).eq("id", editando.id);
    setSalvando(false);
    setAviso(error ? error.message : "Automação salva.");
    if (!error) setEditando(null);
    carregar();
  };

  return (
    <main style={{ flex: 1, overflowY: "auto", padding: 28, background: "#f8fafc" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
        <header style={{ borderRadius: 20, padding: "24px 26px", color: "white", background: "linear-gradient(135deg,#312e81,#7c3aed)", boxShadow: "0 16px 35px rgba(76,29,149,.22)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, opacity: .8 }}>AUTOMAÇÃO POR EVENTOS</div>
          <h1 style={{ margin: "7px 0 5px", fontSize: 26 }}>Mensagens automáticas dos módulos</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: .86 }}>CRM, Cobrança e Suporte disparam mensagens quando o status muda, mesmo sem o cliente iniciar a conversa.</p>
        </header>

        {aviso && <div style={{ padding: "11px 14px", borderRadius: 12, background: "#eef2ff", color: "#3730a3", fontSize: 13, fontWeight: 700 }}>{aviso}</div>}

        <section style={{ display: "grid", gap: 16 }}>
          {grupos.map(grupo => <div key={grupo.nome} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,23,42,.05)" }}>
            <div style={{ padding: "15px 18px", borderBottom: "1px solid #e2e8f0" }}>
              <b style={{ color: CORES[grupo.nome], fontSize: 14 }}>{grupo.nome}</b>
              <span style={{ marginLeft: 9, color: "#94a3b8", fontSize: 11 }}>{grupo.regras.filter(r => r.ativo).length}/{grupo.regras.length} ativas</span>
            </div>
            {grupo.regras.map(regra => {
              const canal = canais.find(item => item.id === regra.canal_id);
              return <div key={regra.id} style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(180px,.7fr) auto auto", gap: 14, alignItems: "center", borderBottom: "1px solid #f1f5f9" }}>
                <div><div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>{regra.nome}</div><div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>{regra.valor_gatilho || regra.evento}</div></div>
                <div style={{ fontSize: 11, color: canal?.status === "conectado" ? "#166534" : "#b45309" }}>{canal ? `${canal.nome} · ${canal.status}` : "Canal não configurado"}</div>
                <button onClick={() => abrir(regra)} style={{ border: "1px solid #cbd5e1", background: "white", color: "#334155", borderRadius: 10, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>Editar</button>
                <button onClick={() => alternar(regra)} style={{ minWidth: 82, border: 0, borderRadius: 999, padding: "8px 12px", color: regra.ativo ? "#166534" : "#475569", background: regra.ativo ? "#dcfce7" : "#e2e8f0", fontWeight: 800, cursor: "pointer" }}>{regra.ativo ? "ATIVA" : "PAUSADA"}</button>
              </div>;
            })}
          </div>)}
        </section>

        <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 16, color: "#0f172a" }}>Últimos eventos do sistema</h2>
          <div style={{ display: "grid", gap: 8 }}>{eventos.map(evento => {
            const visual = statusVisual(evento.status);
            return <div key={evento.id} style={{ display: "grid", gridTemplateColumns: "90px minmax(220px,1fr) 160px", gap: 12, alignItems: "center", padding: "10px 12px", background: "#f8fafc", borderRadius: 11, fontSize: 11 }}>
              <span style={{ ...visual, borderRadius: 999, padding: "5px 8px", textAlign: "center", fontWeight: 800 }}>{evento.status}</span>
              <span><b style={{ color: "#0f172a" }}>{evento.payload?.nome || evento.evento}</b><br/><span style={{ color: "#64748b" }}>{evento.valor_gatilho || evento.evento}{evento.erro ? ` · ${evento.erro}` : ""}</span></span>
              <span style={{ color: "#64748b", textAlign: "right" }}>{new Date(evento.created_at).toLocaleString("pt-BR")}</span>
            </div>;
          })}</div>
        </section>
      </div>

      {editando && <div onClick={() => setEditando(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(620px,100%)", borderRadius: 20, background: "white", padding: 22, boxShadow: "0 24px 70px rgba(15,23,42,.35)" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>{editando.nome}</h2>
          <p style={{ color: "#64748b", fontSize: 12 }}>Variáveis usam o formato {"{{nome}}"}, {"{{valor}}"} e {"{{vencimento}}"}.</p>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#334155" }}>Canal
            <select value={canalId} onChange={e => setCanalId(e.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: 11, padding: 11, background: "white" }}>
              <option value="">Selecione</option>{canais.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.tipo} · {c.status}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, marginTop: 14, fontSize: 12, fontWeight: 800, color: "#334155" }}>Mensagem
            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={8} style={{ resize: "vertical", border: "1px solid #cbd5e1", borderRadius: 11, padding: 12, fontFamily: "inherit", lineHeight: 1.5 }} />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 16 }}>
            <button onClick={() => setEditando(null)} style={{ border: "1px solid #cbd5e1", background: "white", borderRadius: 10, padding: "10px 15px", cursor: "pointer" }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ border: 0, color: "white", background: "#7c3aed", borderRadius: 10, padding: "10px 17px", fontWeight: 800, cursor: "pointer" }}>{salvando ? "Salvando..." : "Salvar"}</button>
          </div>
        </div>
      </div>}
    </main>
  );
}
