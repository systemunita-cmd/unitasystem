"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../hooks/useWorkspace";
import { usePermissao } from "../hooks/usePermissao";
import { useModulos, ModuloBloqueado } from "../hooks/useModulos";

type ConexaoVoip = {
  id: number;
  workspace_id: string;
  provider: "twilio" | "zenvia";
  nome: string;
  status: string;
  erro_msg?: string;
  numero_bina?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_api_key_sid?: string;
  twilio_api_key_secret?: string;
  twilio_twiml_app_sid?: string;
  twilio_numero_did?: string;
  zenvia_access_token?: string;
  zenvia_did_id?: number;
  zenvia_numero_did?: string;
  permite_gravacao: boolean;
  horario_inicio?: string;
  horario_fim?: string;
  dias_permitidos?: string[];
  created_at: string;
};

export default function ConexoesVoipSection() {
  const { workspace, wsId, user } = useWorkspace();
  const { isDono, isSuperAdmin, permissoes } = usePermissao();
  const { modulos, carregado: modulosCarregados } = useModulos();

  const [conexoes, setConexoes] = useState<ConexaoVoip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modoEdicao, setModoEdicao] = useState<ConexaoVoip | null>(null);
  const [providerEscolhido, setProviderEscolhido] = useState<"twilio" | "zenvia" | null>(null);

  const [nome, setNome] = useState("");
  const [numeroBina, setNumeroBina] = useState("");
  const [permiteGravacao, setPermiteGravacao] = useState(true);
  const [horarioInicio, setHorarioInicio] = useState("09:00");
  const [horarioFim, setHorarioFim] = useState("18:00");
  const [diasPermitidos, setDiasPermitidos] = useState<string[]>(["seg","ter","qua","qui","sex","sab"]);

  // Twilio
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioApiKeySid, setTwilioApiKeySid] = useState("");
  const [twilioApiKeySecret, setTwilioApiKeySecret] = useState("");
  const [twilioTwimlAppSid, setTwilioTwimlAppSid] = useState("");
  const [twilioNumeroDid, setTwilioNumeroDid] = useState("");

  // Zenvia
  const [zenviaAccessToken, setZenviaAccessToken] = useState("");
  const [zenviaDidId, setZenviaDidId] = useState("");
  const [zenviaNumeroDid, setZenviaNumeroDid] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [mostrarAjuda, setMostrarAjuda] = useState<"twilio" | "zenvia" | null>(null);

  // 🆕 HIERARQUIA Presidente → STF → Ministros:
  //   👑 Super Admin Wolf (você): bypass total
  //   🏢 Dono workspace: respeita módulo do plano (se plano tem VOIP, vê)
  //   👤 Sub-usuário (Supervisor/Atendente/Admin): respeita plano E grupo de permissão (voip_conexoes)
  const podeGerenciar = (() => {
    if (isSuperAdmin) return true;
    if (!modulos.voip) return false;
    if (isDono) return true;
    return !!permissoes.voip_conexoes;
  })();

  const wa = async (rota: string, body?: object) => {
    const opts: any = body !== undefined
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "GET" };
    const resp = await fetch(`/api/whatsapp?rota=${rota}`, opts);
    return resp.json();
  };

  const fetchConexoes = async () => {
    if (!wsId) return;
    setLoading(true);
    const resp = await wa(`voip/conexoes/listar&workspaceId=${wsId}`);
    if (!resp.success) {
      // Fallback Supabase
      const { data } = await supabase.from("conexoes_voip").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false });
      setConexoes(data || []);
    } else {
      setConexoes(resp.conexoes || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!wsId) return;
    fetchConexoes();
    const ch = supabase.channel("voip_" + wsId)
      .on("postgres_changes", { event: "*", schema: "public", table: "conexoes_voip", filter: `workspace_id=eq.${wsId}` }, () => fetchConexoes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wsId]);

  const limparForm = () => {
    setNome(""); setNumeroBina(""); setPermiteGravacao(true);
    setHorarioInicio("09:00"); setHorarioFim("18:00"); setDiasPermitidos(["seg","ter","qua","qui","sex","sab"]);
    setTwilioAccountSid(""); setTwilioAuthToken(""); setTwilioApiKeySid("");
    setTwilioApiKeySecret(""); setTwilioTwimlAppSid(""); setTwilioNumeroDid("");
    setZenviaAccessToken(""); setZenviaDidId(""); setZenviaNumeroDid("");
    setModoEdicao(null); setProviderEscolhido(null);
  };

  const abrirParaEditar = (c: ConexaoVoip) => {
    setModoEdicao(c);
    setProviderEscolhido(c.provider);
    setNome(c.nome);
    setNumeroBina(c.numero_bina || "");
    setPermiteGravacao(c.permite_gravacao);
    setHorarioInicio(c.horario_inicio || "09:00");
    setHorarioFim(c.horario_fim || "18:00");
    setDiasPermitidos(c.dias_permitidos || []);
    if (c.provider === "twilio") {
      setTwilioAccountSid(c.twilio_account_sid || "");
      setTwilioAuthToken("");
      setTwilioApiKeySid(c.twilio_api_key_sid || "");
      setTwilioApiKeySecret("");
      setTwilioTwimlAppSid(c.twilio_twiml_app_sid || "");
      setTwilioNumeroDid(c.twilio_numero_did || "");
    } else if (c.provider === "zenvia") {
      setZenviaAccessToken("");
      setZenviaDidId(c.zenvia_did_id?.toString() || "");
      setZenviaNumeroDid(c.zenvia_numero_did || "");
    }
    setShowModal(true);
  };

  const salvar = async () => {
    if (!nome.trim()) { alert("Digite um nome pra conexão"); return; }
    if (!providerEscolhido) { alert("Escolha o provedor"); return; }

    setEnviando(true);
    try {
      const config: any = {
        numero_bina: numeroBina,
        permite_gravacao: permiteGravacao,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        dias_permitidos: diasPermitidos
      };

      if (providerEscolhido === "twilio") {
        if (!modoEdicao && (!twilioAccountSid || !twilioAuthToken)) {
          alert("Account SID e Auth Token são obrigatórios"); setEnviando(false); return;
        }
        if (twilioAccountSid) config.twilio_account_sid = twilioAccountSid;
        if (twilioAuthToken) config.twilio_auth_token = twilioAuthToken;
        if (twilioApiKeySid) config.twilio_api_key_sid = twilioApiKeySid;
        if (twilioApiKeySecret) config.twilio_api_key_secret = twilioApiKeySecret;
        if (twilioTwimlAppSid) config.twilio_twiml_app_sid = twilioTwimlAppSid;
        if (twilioNumeroDid) config.twilio_numero_did = twilioNumeroDid;
      } else if (providerEscolhido === "zenvia") {
        if (!modoEdicao && !zenviaAccessToken) {
          alert("Access Token é obrigatório"); setEnviando(false); return;
        }
        if (zenviaAccessToken) config.zenvia_access_token = zenviaAccessToken;
        if (zenviaDidId) config.zenvia_did_id = parseInt(zenviaDidId);
        if (zenviaNumeroDid) config.zenvia_numero_did = zenviaNumeroDid;
      }

      let resp;
      if (modoEdicao) {
        resp = await wa("voip/conexao/atualizar", {
          conexaoId: modoEdicao.id,
          workspaceId: wsId,
          campos: { nome, ...config }
        });
      } else {
        resp = await wa("voip/conexao/criar", {
          workspaceId: wsId,
          provider: providerEscolhido,
          nome,
          config
        });
      }

      if (!resp.success) {
        alert("❌ Erro: " + (resp.error || "desconhecido"));
      } else {
        alert(modoEdicao ? "✅ Conexão atualizada!" : `✅ Conexão criada e testada!${resp.info_conta?.nome_conta ? "\n\nConta: " + resp.info_conta.nome_conta : ""}`);
        setShowModal(false);
        limparForm();
        fetchConexoes();
      }
    } catch (e: any) {
      alert("❌ Erro: " + e.message);
    }
    setEnviando(false);
  };

  const testarConexao = async (c: ConexaoVoip) => {
    const resp = await wa("voip/conexao/testar", { conexaoId: c.id, workspaceId: wsId });
    if (resp.success) {
      const info = resp.info || {};
      alert(`✅ Conexão OK!\n\n${c.provider === "twilio" ? `Conta: ${info.nome_conta}\nStatus: ${info.status_conta}` : `Email: ${info.email}\nSaldo: R$ ${info.saldo || "?"}`}`);
    } else {
      alert(`❌ Conexão falhou: ${resp.info?.erro || resp.error}`);
    }
    fetchConexoes();
  };

  const deletar = async (c: ConexaoVoip) => {
    if (!confirm(`Deletar conexão "${c.nome}"?\n\nIsso remove as credenciais. Ligações antigas continuam no histórico.`)) return;
    const resp = await wa("voip/conexao/deletar", { conexaoId: c.id, workspaceId: wsId });
    if (resp.success) fetchConexoes();
    else alert("Erro ao deletar: " + resp.error);
  };

  const toggleDia = (dia: string) => {
    setDiasPermitidos(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const corStatus = (s: string) => s === "conectado" ? "#16a34a" : s === "erro" ? "#dc2626" : s === "testando" ? "#f59e0b" : "#6b7280";
  const emojiStatus = (s: string) => s === "conectado" ? "🟢" : s === "erro" ? "🔴" : s === "testando" ? "🟡" : "⚫";

  // 🎨 ESTILOS LIGHT TECH
  const IS = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" };
  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  if (modulosCarregados && !modulos.voip && !isSuperAdmin) {
    return <ModuloBloqueado modulo="voip" />;
  }

  if (!podeGerenciar) {
    return (
      <div style={{ padding: 32, minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(239,68,68,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span>
          </div>
          <h1 style={{ color: "#1f2937", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Acesso Restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 8px" }}>Seu usuário não tem permissão para gerenciar conexões VOIP.</p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, lineHeight: 1.5 }}>Peça ao dono do workspace pra marcar "Gerenciar conexões VOIP" no seu grupo de permissão.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, background: "#f8fafc", minHeight: "100vh" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, boxShadow: "0 8px 20px rgba(22,163,74,0.25)",
        }}>
          <span style={{ filter: "saturate(0) brightness(2)" }}>📞</span>
        </div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Telefonia VOIP</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0", lineHeight: 1.5, maxWidth: 760 }}>
            Conecte um provedor VOIP (Twilio ou Zenvia) pra fazer ligações pelo sistema. Cada workspace tem suas próprias conexões.
          </p>
        </div>
      </div>

      {/* ═══ AVISO LGPD ═══ */}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderLeft: "4px solid #f59e0b", borderRadius: 12, padding: "14px 18px" }}>
        <p style={{ color: "#92400e", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          <b>⚠️ Importante:</b> ligação em massa pra quem não autorizou é proibido no Brasil (LGPD + Anatel).
          Os contatos marcados como "sem opt-in" serão <b>automaticamente ignorados</b> nas campanhas. Você pode marcar o opt-in
          no cadastro de cada cliente ou importá-lo via CSV.
        </p>
      </div>

      {/* ═══ LISTA DE CONEXÕES ═══ */}
      {loading ? (
        <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Carregando...</p>
      ) : conexoes.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", border: "1px dashed #d1d5db" }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(22,163,74,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📞</span>
          </div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Nenhum provedor conectado ainda</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 18px" }}>Conecte Twilio ou Zenvia pra começar a fazer ligações.</p>
          <button onClick={() => { limparForm(); setShowModal(true); }}
            style={{
              background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
              color: "white", border: "none", borderRadius: 12,
              padding: "12px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700,
              boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
            }}>
            + Conectar Provedor
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {conexoes.map(c => {
            const cor = corStatus(c.status);
            return (
              <div key={c.id}
                style={{
                  ...cardStyle,
                  padding: 18,
                  borderTop: `3px solid ${cor}`,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 20px ${cor}20`; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>
                      {c.provider === "twilio" ? "🌐" : "🇧🇷"} {c.nome}
                    </p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "3px 0 0", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.3 }}>
                      {c.provider === "twilio" ? "Twilio" : "Zenvia"} · ID {c.id}
                    </p>
                  </div>
                  <span style={{
                    background: `${cor}15`, color: cor,
                    border: `1px solid ${cor}40`,
                    fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                    {emojiStatus(c.status)} {c.status}
                  </span>
                </div>

                {c.numero_bina && (
                  <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>
                    📱 Bina: <code style={{ color: "#16a34a", fontFamily: "monospace", background: "#f0fdf4", padding: "2px 6px", borderRadius: 4, border: "1px solid #bbf7d0", fontWeight: 600 }}>{c.numero_bina}</code>
                  </p>
                )}
                {c.provider === "twilio" && c.twilio_numero_did && (
                  <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>
                    ☎️ DID: <code style={{ color: "#3b82f6", fontFamily: "monospace", background: "#eff6ff", padding: "2px 6px", borderRadius: 4, border: "1px solid #bfdbfe", fontWeight: 600 }}>{c.twilio_numero_did}</code>
                  </p>
                )}
                {c.provider === "zenvia" && c.zenvia_numero_did && (
                  <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>
                    ☎️ DID: <code style={{ color: "#3b82f6", fontFamily: "monospace", background: "#eff6ff", padding: "2px 6px", borderRadius: 4, border: "1px solid #bfdbfe", fontWeight: 600 }}>{c.zenvia_numero_did}</code>
                  </p>
                )}

                <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0" }}>
                  🕘 Horário: <b style={{ color: "#374151" }}>{c.horario_inicio}–{c.horario_fim}</b> · <b style={{ color: "#374151" }}>{(c.dias_permitidos || []).length} dias</b>
                </p>
                <p style={{ color: "#6b7280", fontSize: 11, margin: "8px 0 14px" }}>
                  {c.permite_gravacao ? "🎙️ Gravação ativa" : "🔇 Sem gravação"}
                </p>

                {c.erro_msg && (
                  <p style={{ background: "#fef2f2", color: "#991b1b", padding: "8px 12px", borderRadius: 8, fontSize: 11, margin: "0 0 12px", border: "1px solid #fecaca" }}>
                    ⚠️ {c.erro_msg}
                  </p>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => testarConexao(c)} title="Re-testar credenciais"
                    style={{ background: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    🔄 Testar
                  </button>
                  <button onClick={() => abrirParaEditar(c)}
                    style={{ background: "#fffbeb", color: "#f59e0b", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => deletar(c)}
                    style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    🗑️ Deletar
                  </button>
                </div>
              </div>
            );
          })}
          {/* Botão "adicionar" sempre visível */}
          <button onClick={() => { limparForm(); setShowModal(true); }}
            style={{
              background: "#ffffff", border: "2px dashed #d1d5db", borderRadius: 14,
              padding: 40, cursor: "pointer", color: "#6b7280", fontSize: 14, fontWeight: 700,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#16a34a"; e.currentTarget.style.color = "#16a34a"; e.currentTarget.style.background = "#f0fdf4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.background = "#ffffff"; }}>
            + Adicionar provedor
          </button>
        </div>
      )}

      {/* ═══ MODAL — CRIAR/EDITAR ═══ */}
      {showModal && (
        <div onClick={() => !enviando && setShowModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardStyle, width: "100%", maxWidth: 700, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
                {modoEdicao ? "✏️ Editar conexão" : "➕ Nova conexão VOIP"}
              </h2>
              <button onClick={() => setShowModal(false)} disabled={enviando}
                style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: enviando ? "not-allowed" : "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
              {/* Seletor de provedor (só na criação) */}
              {!modoEdicao && !providerEscolhido && (
                <div>
                  <p style={{ color: "#6b7280", fontSize: 11, margin: "0 0 12px", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                    Escolha o provedor
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button onClick={() => setProviderEscolhido("twilio")}
                      style={{
                        background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: 12,
                        padding: 18, cursor: "pointer", textAlign: "left",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(59,130,246,0.15)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <p style={{ fontSize: 30, margin: "0 0 8px" }}>🌐</p>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Twilio</p>
                      <p style={{ color: "#6b7280", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                        Internacional · Docs em inglês · Preços em USD<br/>
                        Fixo BR ~R$ 0,08/min · Móvel BR ~R$ 0,30/min
                      </p>
                    </button>
                    <button onClick={() => setProviderEscolhido("zenvia")}
                      style={{
                        background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: 12,
                        padding: 18, cursor: "pointer", textAlign: "left",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#16a34a"; e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(22,163,74,0.15)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <p style={{ fontSize: 30, margin: "0 0 8px" }}>🇧🇷</p>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Zenvia</p>
                      <p style={{ color: "#6b7280", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                        Brasileiro · Docs em PT · Suporte BR<br/>
                        Fixo R$ 0,09/min · Móvel R$ 0,35/min
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Formulário */}
              {providerEscolhido && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: providerEscolhido === "twilio" ? "#eff6ff" : "#f0fdf4",
                      border: `1px solid ${providerEscolhido === "twilio" ? "#bfdbfe" : "#bbf7d0"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                    }}>
                      {providerEscolhido === "twilio" ? "🌐" : "🇧🇷"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>
                        {providerEscolhido === "twilio" ? "Twilio" : "Zenvia"}
                      </p>
                      <button onClick={() => setMostrarAjuda(providerEscolhido)}
                        style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline", fontWeight: 600 }}>
                        📖 Como obter as credenciais?
                      </button>
                    </div>
                    {!modoEdicao && (
                      <button onClick={() => setProviderEscolhido(null)}
                        style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11, cursor: "pointer", padding: "5px 12px", borderRadius: 8, fontWeight: 600 }}>
                        trocar
                      </button>
                    )}
                  </div>

                  <div>
                    <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Nome da conexão *</label>
                    <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Twilio Vendas" style={IS} />
                  </div>

                  {/* Campos Twilio */}
                  {providerEscolhido === "twilio" && (
                    <>
                      <div>
                        <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                          Account SID * {modoEdicao && <span style={{ color: "#f59e0b", textTransform: "none", fontWeight: 500 }}>(já salvo, só substitui se mudar)</span>}
                        </label>
                        <input value={twilioAccountSid} onChange={e => setTwilioAccountSid(e.target.value)} placeholder="AC•••••••••••••••••••••••••••" style={{ ...IS, fontFamily: "monospace" }} />
                      </div>
                      <div>
                        <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                          Auth Token * {modoEdicao && <span style={{ color: "#f59e0b", textTransform: "none", fontWeight: 500 }}>(deixe vazio pra manter)</span>}
                        </label>
                        <input type="password" value={twilioAuthToken} onChange={e => setTwilioAuthToken(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" style={{ ...IS, fontFamily: "monospace" }} />
                      </div>
                      <div>
                        <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Número DID (Caller ID)</label>
                        <input value={twilioNumeroDid} onChange={e => setTwilioNumeroDid(e.target.value)} placeholder="+5511999999999" style={IS} />
                        <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>Número comprado na Twilio que aparece no celular de quem recebe.</p>
                      </div>
                      <details open style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px" }}>
                        <summary style={{ cursor: "pointer", color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>⚡ Credenciais para ligações no navegador (obrigatório)</summary>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                          <div style={{ background: "#ffffff", border: "1px solid #bbf7d0", borderLeft: "4px solid #16a34a", borderRadius: 10, padding: 12 }}>
                            <p style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, margin: "0 0 8px" }}>📋 URL pra cadastrar no TwiML App da Twilio:</p>
                            <code style={{ display: "block", color: "#1f2937", fontSize: 11, background: "#1f2937", color: "#86efac", padding: "8px 10px", borderRadius: 6, wordBreak: "break-all", fontFamily: "monospace" }}>
                              https://api.wolfgyn.com.br/voip/twilio/twiml/{wsId || "SEU_WORKSPACE"}
                            </code>
                            <p style={{ color: "#6b7280", fontSize: 10, margin: "8px 0 0" }}>
                              No dashboard Twilio → Voice → TwiML Apps → (criar) → cole essa URL no campo "Voice Request URL" (método POST).
                            </p>
                          </div>
                          <div>
                            <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>API Key SID *</label>
                            <input value={twilioApiKeySid} onChange={e => setTwilioApiKeySid(e.target.value)} placeholder="SK•••••" style={{ ...IS, fontFamily: "monospace" }} />
                          </div>
                          <div>
                            <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>API Key Secret *</label>
                            <input type="password" value={twilioApiKeySecret} onChange={e => setTwilioApiKeySecret(e.target.value)} placeholder="•••••" style={{ ...IS, fontFamily: "monospace" }} />
                          </div>
                          <div>
                            <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>TwiML App SID *</label>
                            <input value={twilioTwimlAppSid} onChange={e => setTwilioTwimlAppSid(e.target.value)} placeholder="AP•••••" style={{ ...IS, fontFamily: "monospace" }} />
                          </div>
                          <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, lineHeight: 1.5 }}>
                            Todos são necessários pra ligar pelo navegador. Veja o tutorial no menu "Ajuda" pra saber como gerar cada um no dashboard Twilio.
                          </p>
                        </div>
                      </details>
                    </>
                  )}

                  {/* Campos Zenvia */}
                  {providerEscolhido === "zenvia" && (
                    <>
                      <div>
                        <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                          Access Token * {modoEdicao && <span style={{ color: "#f59e0b", textTransform: "none", fontWeight: 500 }}>(deixe vazio pra manter)</span>}
                        </label>
                        <input type="password" value={zenviaAccessToken} onChange={e => setZenviaAccessToken(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" style={{ ...IS, fontFamily: "monospace" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                        <div>
                          <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>DID ID</label>
                          <input value={zenviaDidId} onChange={e => setZenviaDidId(e.target.value)} placeholder="123" style={IS} />
                        </div>
                        <div>
                          <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Número DID (Caller ID)</label>
                          <input value={zenviaNumeroDid} onChange={e => setZenviaNumeroDid(e.target.value)} placeholder="+5511999999999" style={IS} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Config comum */}
                  <div>
                    <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>📱 Bina (opcional)</label>
                    <input value={numeroBina} onChange={e => setNumeroBina(e.target.value)} placeholder="+5562981519991" style={IS} />
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>Número alternativo que aparece no celular de quem recebe. Se vazio, usa o DID.</p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>🕘 Horário início</label>
                      <input type="time" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} style={{ ...IS, colorScheme: "light" }} />
                    </div>
                    <div>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>🕘 Horário fim</label>
                      <input type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)} style={{ ...IS, colorScheme: "light" }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 8, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>📅 Dias permitidos pra ligação</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[["seg","Seg"],["ter","Ter"],["qua","Qua"],["qui","Qui"],["sex","Sex"],["sab","Sáb"],["dom","Dom"]].map(([id, label]) => {
                        const ativo = diasPermitidos.includes(id);
                        return (
                          <button key={id} onClick={() => toggleDia(id)}
                            style={{
                              background: ativo ? "#f0fdf4" : "#f9fafb",
                              border: `1px solid ${ativo ? "#16a34a" : "#e5e7eb"}`,
                              color: ativo ? "#16a34a" : "#6b7280",
                              borderRadius: 10, padding: "7px 16px", fontSize: 12,
                              cursor: "pointer", fontWeight: 700,
                              boxShadow: ativo ? "0 2px 6px rgba(22,163,74,0.15)" : "none",
                              transition: "all 0.15s",
                            }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label style={{
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    background: permiteGravacao ? "#f0fdf4" : "#f9fafb",
                    border: `1px solid ${permiteGravacao ? "#bbf7d0" : "#e5e7eb"}`,
                    padding: "12px 14px", borderRadius: 12,
                    transition: "all 0.15s",
                  }}>
                    <input type="checkbox" checked={permiteGravacao} onChange={e => setPermiteGravacao(e.target.checked)} style={{ accentColor: "#16a34a", width: 16, height: 16 }} />
                    <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 600 }}>🎙️ Gravar chamadas automaticamente</span>
                  </label>
                  <p style={{ color: "#9ca3af", fontSize: 10, margin: "-8px 0 0", paddingLeft: 4 }}>
                    Por LGPD, você deve avisar o cliente de que a ligação é gravada no início da chamada.
                  </p>
                </div>
              )}
            </div>

            {providerEscolhido && (
              <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f9fafb" }}>
                <button onClick={() => setShowModal(false)} disabled={enviando}
                  style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: enviando ? "not-allowed" : "pointer", fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={salvar} disabled={enviando}
                  style={{
                    background: enviando ? "#15803d" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                    color: "white", border: "none", borderRadius: 10,
                    padding: "10px 24px", fontSize: 13,
                    cursor: enviando ? "not-allowed" : "pointer", fontWeight: 700,
                    boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
                  }}>
                  {enviando ? "⏳ Testando e salvando..." : modoEdicao ? "💾 Salvar" : "🔌 Conectar e testar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODAL AJUDA ═══ */}
      {mostrarAjuda && (
        <div onClick={() => setMostrarAjuda(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardStyle, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: mostrarAjuda === "twilio" ? "#eff6ff" : "#f0fdf4",
                border: `1px solid ${mostrarAjuda === "twilio" ? "#bfdbfe" : "#bbf7d0"}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              }}>
                {mostrarAjuda === "twilio" ? "🌐" : "🇧🇷"}
              </div>
              <h2 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: 0 }}>
                Como obter credenciais {mostrarAjuda === "twilio" ? "Twilio" : "Zenvia"}
              </h2>
            </div>

            {mostrarAjuda === "twilio" ? (
              <ol style={{ color: "#374151", fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
                <li>Acesse <a href="https://www.twilio.com/try-twilio" target="_blank" style={{ color: "#3b82f6", fontWeight: 600 }}>twilio.com/try-twilio</a> e crie uma conta (trial tem USD 15 grátis).</li>
                <li>No painel, copie o <b>Account SID</b> e <b>Auth Token</b> da página inicial.</li>
                <li>Menu esquerdo → <b>Phone Numbers → Buy a Number</b> → compra um número BR (~USD 1/mês).</li>
                <li>Cole o número no campo <b>DID (Caller ID)</b> com prefixo internacional: <code style={{ background: "#f3f4f6", color: "#1f2937", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", border: "1px solid #e5e7eb" }}>+55...</code></li>
                <li>Pronto! Com Account SID + Auth Token + Número você já faz ligações via API.</li>
                <li><b>(Opcional, pra softphone no navegador)</b>: vai em <b>API Keys</b> e gera uma chave com permissão Voice. Depois cria um <b>TwiML App</b> apontando pra <code style={{ background: "#f3f4f6", color: "#1f2937", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", border: "1px solid #e5e7eb" }}>https://api.wolfgyn.com.br/voip/twiml</code>. Mas isso só precisa na Fase 2.</li>
              </ol>
            ) : (
              <ol style={{ color: "#374151", fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
                <li>Acesse <a href="https://zenvia.com" target="_blank" style={{ color: "#3b82f6", fontWeight: 600 }}>zenvia.com</a> e solicite demonstração comercial (é pay-as-you-go após setup).</li>
                <li>Após ativar a conta, entre no painel <a href="https://app.zenvia.com" target="_blank" style={{ color: "#3b82f6", fontWeight: 600 }}>app.zenvia.com</a>.</li>
                <li>Menu → <b>API Tokens</b> → gere um token com permissão de <b>Voice</b>.</li>
                <li>Menu → <b>DIDs</b> → aluga um número brasileiro. Anote o <b>ID do DID</b> e o <b>número</b>.</li>
                <li>Cole o token, DID ID e o número nos campos aqui.</li>
                <li>Pronto! Lembrete: Zenvia cobra setup inicial + minutagem. Confirme os valores com o comercial deles.</li>
              </ol>
            )}

            <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setMostrarAjuda(null)}
                style={{
                  background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
                }}>
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}