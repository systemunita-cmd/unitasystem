"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { usePermissao } from "../hooks/usePermissao";

// ═══ 📞 ConexoesVoipSection — UnitaSystem (single-tenant, direto no Supabase) ═══
// Adaptado do Wolf: SEM a API /api/whatsapp (não existe no Unita). CRUD direto
// na tabela conexoes_voip com workspace_id fixo "unita" (compat c/ useSoftphone).

type ConexaoVoip = {
  id: number; workspace_id: string; provider: "twilio" | "zenvia"; nome: string;
  status: string; erro_msg?: string | null; numero_bina?: string | null;
  twilio_account_sid?: string | null; twilio_auth_token?: string | null;
  twilio_api_key_sid?: string | null; twilio_api_key_secret?: string | null;
  twilio_twiml_app_sid?: string | null; twilio_numero_did?: string | null;
  zenvia_access_token?: string | null; zenvia_did_id?: number | null; zenvia_numero_did?: string | null;
  permite_gravacao: boolean; horario_inicio?: string | null; horario_fim?: string | null;
  dias_permitidos?: string[] | null; created_at: string;
};

const WS = "unita";

export default function ConexoesVoipSection() {
  const { isDono, isSuperAdmin, permissoes } = usePermissao();
  const [conexoes, setConexoes] = useState<ConexaoVoip[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabelaFalta, setTabelaFalta] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modoEdicao, setModoEdicao] = useState<ConexaoVoip | null>(null);
  const [provider, setProvider] = useState<"twilio" | "zenvia" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [f, setF] = useState<Record<string, any>>({});
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const podeGerenciar = isSuperAdmin || isDono || !!permissoes.voip_conexoes;

  const fetchConexoes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("conexoes_voip").select("*")
      .order("created_at", { ascending: false });
    if (error && (error as any).code === "PGRST205") setTabelaFalta(true);
    setConexoes(data || []);
    setLoading(false);
  };
  useEffect(() => {
    fetchConexoes();
    const ch = supabase.channel("voip_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "conexoes_voip" }, () => fetchConexoes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const limpar = () => { setF({ permite_gravacao: true, horario_inicio: "09:00", horario_fim: "18:00", dias: ["seg","ter","qua","qui","sex","sab"] }); setModoEdicao(null); setProvider(null); };
  const abrirNovo = () => { limpar(); setShowModal(true); };
  const abrirEditar = (c: ConexaoVoip) => {
    setModoEdicao(c); setProvider(c.provider);
    setF({ nome: c.nome, numero_bina: c.numero_bina || "", permite_gravacao: c.permite_gravacao,
      horario_inicio: c.horario_inicio || "09:00", horario_fim: c.horario_fim || "18:00",
      dias: c.dias_permitidos || [], twilio_account_sid: c.twilio_account_sid || "",
      twilio_api_key_sid: c.twilio_api_key_sid || "", twilio_twiml_app_sid: c.twilio_twiml_app_sid || "",
      twilio_numero_did: c.twilio_numero_did || "", zenvia_did_id: c.zenvia_did_id?.toString() || "",
      zenvia_numero_did: c.zenvia_numero_did || "" });
    setShowModal(true);
  };

  const salvar = async () => {
    if (!String(f.nome || "").trim()) { alert("Digite um nome pra conexão"); return; }
    if (!provider) { alert("Escolha o provedor"); return; }
    setEnviando(true);
    try {
      const payload: any = {
        workspace_id: WS, provider, nome: f.nome,
        numero_bina: f.numero_bina || null, permite_gravacao: !!f.permite_gravacao,
        horario_inicio: f.horario_inicio, horario_fim: f.horario_fim,
        dias_permitidos: f.dias || [], status: "conectado",
      };
      if (provider === "twilio") {
        if (!modoEdicao && (!f.twilio_account_sid || !f.twilio_auth_token)) { alert("Account SID e Auth Token são obrigatórios"); setEnviando(false); return; }
        if (f.twilio_account_sid) payload.twilio_account_sid = f.twilio_account_sid;
        if (f.twilio_auth_token) payload.twilio_auth_token = f.twilio_auth_token;
        if (f.twilio_api_key_sid) payload.twilio_api_key_sid = f.twilio_api_key_sid;
        if (f.twilio_api_key_secret) payload.twilio_api_key_secret = f.twilio_api_key_secret;
        if (f.twilio_twiml_app_sid) payload.twilio_twiml_app_sid = f.twilio_twiml_app_sid;
        if (f.twilio_numero_did) payload.twilio_numero_did = f.twilio_numero_did;
      } else {
        if (!modoEdicao && !f.zenvia_access_token) { alert("Access Token é obrigatório"); setEnviando(false); return; }
        if (f.zenvia_access_token) payload.zenvia_access_token = f.zenvia_access_token;
        if (f.zenvia_did_id) payload.zenvia_did_id = parseInt(f.zenvia_did_id);
        if (f.zenvia_numero_did) payload.zenvia_numero_did = f.zenvia_numero_did;
      }
      const res = modoEdicao
        ? await supabase.from("conexoes_voip").update(payload).eq("id", modoEdicao.id)
        : await supabase.from("conexoes_voip").insert([payload]);
      if (res.error) alert("❌ Erro: " + res.error.message + (tabelaFalta ? "\n\nA tabela conexoes_voip não existe — me peça o SQL." : ""));
      else { alert(modoEdicao ? "✅ Conexão atualizada!" : "✅ Conexão salva!"); setShowModal(false); limpar(); fetchConexoes(); }
    } catch (e: any) { alert("❌ Erro: " + e.message); }
    setEnviando(false);
  };

  const deletar = async (c: ConexaoVoip) => {
    if (!confirm(`Deletar conexão "${c.nome}"?`)) return;
    const { error } = await supabase.from("conexoes_voip").delete().eq("id", c.id);
    if (error) alert("Erro ao deletar: " + error.message); else fetchConexoes();
  };

  const toggleDia = (d: string) => set("dias", (f.dias || []).includes(d) ? (f.dias || []).filter((x: string) => x !== d) : [...(f.dias || []), d]);
  const corStatus = (s: string) => s === "conectado" ? "#16a34a" : s === "erro" ? "#dc2626" : "#6b7280";
  const IS = { width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } as const;
  const lbl = { color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 700, letterSpacing: 0.5 };

  if (!podeGerenciar) {
    return (
      <div style={{ padding: 32, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ ...card, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px" }}><span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span></div>
          <h1 style={{ color: "#1f2937", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Acesso Restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Peça ao administrador pra marcar "Gerenciar conexões VOIP" no seu grupo.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 8px 20px rgba(22,163,74,0.25)" }}><span style={{ filter: "saturate(0) brightness(2)" }}>📞</span></div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0 }}>Telefonia VOIP</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0" }}>Conecte Twilio ou Zenvia pra fazer ligações pelo sistema.</p>
        </div>
      </div>
      {tabelaFalta && <div style={{ ...card, padding: "12px 16px", borderLeft: "4px solid #f59e0b", color: "#92400e", fontSize: 13, fontWeight: 700 }}>⚠️ A tabela <code>conexoes_voip</code> ainda não existe no Supabase — me peça o SQL de criação.</div>}
      {loading ? <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Carregando...</p>
      : conexoes.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: "center", border: "1px dashed #d1d5db" }}>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>📞 Nenhum provedor conectado ainda</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 18px" }}>Conecte Twilio ou Zenvia pra começar a fazer ligações.</p>
          <button onClick={abrirNovo} style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Conectar Provedor</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {conexoes.map(c => {
            const cor = corStatus(c.status);
            return (
              <div key={c.id} style={{ ...card, padding: 18, borderTop: `3px solid ${cor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>{c.provider === "twilio" ? "🌐" : "🇧🇷"} {c.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "3px 0 0", textTransform: "uppercase", fontWeight: 600 }}>{c.provider} · ID {c.id}</p>
                  </div>
                  <span style={{ background: `${cor}15`, color: cor, border: `1px solid ${cor}40`, fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 700 }}>{c.status === "conectado" ? "🟢" : "⚫"} {c.status}</span>
                </div>
                {c.twilio_numero_did && <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>☎️ DID: <code style={{ color: "#3b82f6", fontFamily: "monospace", background: "#eff6ff", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{c.twilio_numero_did}</code></p>}
                {c.zenvia_numero_did && <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>☎️ DID: <code style={{ color: "#3b82f6", fontFamily: "monospace", background: "#eff6ff", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{c.zenvia_numero_did}</code></p>}
                <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>🕘 <b style={{ color: "#374151" }}>{c.horario_inicio}–{c.horario_fim}</b> · <b style={{ color: "#374151" }}>{(c.dias_permitidos || []).length} dias</b> · {c.permite_gravacao ? "🎙️ Grava" : "🔇 Sem gravação"}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => abrirEditar(c)} style={{ background: "#fffbeb", color: "#f59e0b", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✏️ Editar</button>
                  <button onClick={() => deletar(c)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️ Deletar</button>
                </div>
              </div>
            );
          })}
          <button onClick={abrirNovo} style={{ background: "#fff", border: "2px dashed #d1d5db", borderRadius: 14, padding: 40, cursor: "pointer", color: "#6b7280", fontSize: 14, fontWeight: 700 }}>+ Adicionar provedor</button>
        </div>
      )}

      {showModal && (
        <div onClick={() => !enviando && setShowModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 700, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>{modoEdicao ? "✏️ Editar conexão" : "➕ Nova conexão VOIP"}</h2>
              <button onClick={() => setShowModal(false)} disabled={enviando} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              {!modoEdicao && !provider && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {(["twilio", "zenvia"] as const).map(pv => (
                    <button key={pv} onClick={() => setProvider(pv)} style={{ background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: 12, padding: 18, cursor: "pointer", textAlign: "left" }}>
                      <p style={{ fontSize: 30, margin: "0 0 8px" }}>{pv === "twilio" ? "🌐" : "🇧🇷"}</p>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>{pv === "twilio" ? "Twilio" : "Zenvia"}</p>
                    </button>
                  ))}
                </div>
              )}
              {provider && (<>
                <div><label style={lbl}>Nome da conexão *</label><input value={f.nome || ""} onChange={e => set("nome", e.target.value)} placeholder="Ex: Twilio Cobrança" style={IS} /></div>
                {provider === "twilio" && (<>
                  <div><label style={lbl}>Account SID *{modoEdicao ? " (já salvo)" : ""}</label><input value={f.twilio_account_sid || ""} onChange={e => set("twilio_account_sid", e.target.value)} placeholder="AC•••" style={{ ...IS, fontFamily: "monospace" }} /></div>
                  <div><label style={lbl}>Auth Token *{modoEdicao ? " (vazio = mantém)" : ""}</label><input type="password" value={f.twilio_auth_token || ""} onChange={e => set("twilio_auth_token", e.target.value)} style={{ ...IS, fontFamily: "monospace" }} /></div>
                  <div><label style={lbl}>Número DID (Caller ID)</label><input value={f.twilio_numero_did || ""} onChange={e => set("twilio_numero_did", e.target.value)} placeholder="+5562999999999" style={IS} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div><label style={lbl}>API Key SID</label><input value={f.twilio_api_key_sid || ""} onChange={e => set("twilio_api_key_sid", e.target.value)} placeholder="SK•••" style={{ ...IS, fontFamily: "monospace" }} /></div>
                    <div><label style={lbl}>API Key Secret</label><input type="password" value={f.twilio_api_key_secret || ""} onChange={e => set("twilio_api_key_secret", e.target.value)} style={{ ...IS, fontFamily: "monospace" }} /></div>
                    <div><label style={lbl}>TwiML App SID</label><input value={f.twilio_twiml_app_sid || ""} onChange={e => set("twilio_twiml_app_sid", e.target.value)} placeholder="AP•••" style={{ ...IS, fontFamily: "monospace" }} /></div>
                  </div>
                </>)}
                {provider === "zenvia" && (<>
                  <div><label style={lbl}>Access Token *{modoEdicao ? " (vazio = mantém)" : ""}</label><input type="password" value={f.zenvia_access_token || ""} onChange={e => set("zenvia_access_token", e.target.value)} style={{ ...IS, fontFamily: "monospace" }} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                    <div><label style={lbl}>DID ID</label><input value={f.zenvia_did_id || ""} onChange={e => set("zenvia_did_id", e.target.value)} placeholder="123" style={IS} /></div>
                    <div><label style={lbl}>Número DID</label><input value={f.zenvia_numero_did || ""} onChange={e => set("zenvia_numero_did", e.target.value)} placeholder="+5511999999999" style={IS} /></div>
                  </div>
                </>)}
                <div><label style={lbl}>📱 Bina (opcional)</label><input value={f.numero_bina || ""} onChange={e => set("numero_bina", e.target.value)} placeholder="+5562981519991" style={IS} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={lbl}>🕘 Início</label><input type="time" value={f.horario_inicio || "09:00"} onChange={e => set("horario_inicio", e.target.value)} style={IS} /></div>
                  <div><label style={lbl}>🕘 Fim</label><input type="time" value={f.horario_fim || "18:00"} onChange={e => set("horario_fim", e.target.value)} style={IS} /></div>
                </div>
                <div>
                  <label style={lbl}>📅 Dias permitidos</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[["seg","Seg"],["ter","Ter"],["qua","Qua"],["qui","Qui"],["sex","Sex"],["sab","Sáb"],["dom","Dom"]].map(([id, l]) => {
                      const at = (f.dias || []).includes(id);
                      return <button key={id} onClick={() => toggleDia(id)} style={{ background: at ? "#f0fdf4" : "#f9fafb", border: `1px solid ${at ? "#16a34a" : "#e5e7eb"}`, color: at ? "#16a34a" : "#6b7280", borderRadius: 10, padding: "7px 16px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>{l}</button>;
                    })}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: f.permite_gravacao ? "#f0fdf4" : "#f9fafb", border: "1px solid #e5e7eb", padding: "12px 14px", borderRadius: 12 }}>
                  <input type="checkbox" checked={!!f.permite_gravacao} onChange={e => set("permite_gravacao", e.target.checked)} style={{ accentColor: "#16a34a", width: 16, height: 16 }} />
                  <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 600 }}>🎙️ Gravar chamadas automaticamente</span>
                </label>
              </>)}
            </div>
            {provider && (
              <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f9fafb" }}>
                <button onClick={() => setShowModal(false)} disabled={enviando} style={{ background: "#fff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={salvar} disabled={enviando} style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>{enviando ? "⏳ Salvando..." : modoEdicao ? "💾 Salvar" : "🔌 Salvar conexão"}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}