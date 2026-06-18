"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../hooks/useToast";
import { usePermissao } from "../../hooks/usePermissao";
import { useTemPermissao } from "../../hooks/useTemPermissao";
import { traduzirErro } from "../../lib/traduzir_erro";

// Tipagem do Facebook SDK
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📡 CONEXÕES — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Gerencia conexões WhatsApp Web JS (via QR Code), API Meta (WABA),
// e Facebook/Instagram (via OAuth). Backend separado é o UnitaZAP.
//
// 🔒 Usuário restrito (Diretor/escopo team) fica TRAVADO na própria equipe:
//    no modal de canal o seletor de equipe vem fixo na equipe dele, e a
//    lista de canais mostra só os da equipe dele (+ os sem equipe/gerais).
//    Admin Geral / Super Admin escolhe qualquer equipe.
//
// Env vars necessárias:
//   NEXT_PUBLIC_UNITAZAP_URL  → backend Node.js do UnitaZAP
//   NEXT_PUBLIC_META_URL      → backend Meta (Facebook OAuth) — opcional
//   NEXT_PUBLIC_FB_APP_ID     → App ID do Facebook (se usar OAuth)
//   NEXT_PUBLIC_FB_CONFIG_ID  → Config ID do Facebook Business Login
// ═══════════════════════════════════════════════════════════════════════

const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";
const META_BASE = process.env.NEXT_PUBLIC_META_URL || UNITAZAP_URL;
const FB_APP_ID = process.env.NEXT_PUBLIC_FB_APP_ID || "";
const FB_CONFIG_ID = process.env.NEXT_PUBLIC_FB_CONFIG_ID || "";

type Conexao = {
  id: number; nome: string; tipo: string; status: string; numero: string;
  modulos?: string[] | null;
  modo: string; ia: string; fluxo_id: string; fluxo_nome: string;
  fila: string; api_key: string; prompt: string; parar_se_atendente: boolean;
  phone_number_id?: string; waba_id?: string; token_waba?: string; webhook_token?: string;
  typebot_url?: string; typebot_msg_invalida?: string; typebot_msg_boas_vindas?: string;
  messenger_ativo?: boolean;
  instagram_ativo?: boolean;
  instagram_business_id?: string;
  instagram_username?: string;
};
type FluxoItem = { id: number; nome: string; ativo: boolean };
type FilaItem = { id: number; nome: string; conexao?: string; equipe_id?: number | null };
type Equipe = { id: number; nome: string; ativo?: boolean };

export function ConexoesSection() {
  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();
  const podeAcessar = perm.superAdmin || perm.tem("conexoes.ver" as any);

  // 🔒 Trava por equipe (Diretor/escopo team)
  const ehAdminGeralCon = perm.superAdmin || perm.grupoNome === "Administração Geral";
  const equipeForcadaCon = (!perm.carregando && !ehAdminGeralCon && perm.equipeId != null) ? String(perm.equipeId) : null;
  const travadoEquipe = equipeForcadaCon !== null;

  const router = useRouter();
  const { notify } = useToast();
  const { isDono } = usePermissao();

  const [conexoes, setConexoes] = useState<Conexao[]>([]);
  const [fluxos, setFluxos] = useState<FluxoItem[]>([]);
  const [filasBanco, setFilasBanco] = useState<FilaItem[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [showModalQR, setShowModalQR] = useState(false);
  const [showMenuEngrenagem, setShowMenuEngrenagem] = useState<number | null>(null);
  const [qrCanalId, setQrCanalId] = useState<number | null>(null);
  const [resetando, setResetando] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [qrPolling, setQrPolling] = useState(false);
  const [qrConectado, setQrConectado] = useState(false);
  const [qrNumero, setQrNumero] = useState("");
  const [qrTentativas, setQrTentativas] = useState(0);
  const [showModalNovoCanal, setShowModalNovoCanal] = useState(false);
  const [conectandoMeta, setConectandoMeta] = useState(false);
  const [resultadoMeta, setResultadoMeta] = useState<{ sucesso?: boolean; mensagem?: string; pages?: any[] } | null>(null);
  const [pagesDisponiveis, setPagesDisponiveis] = useState<any[]>([]);
  const [pagesSelecionadas, setPagesSelecionadas] = useState<Set<string>>(new Set());
  const [showSelecaoPages, setShowSelecaoPages] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [salvandoCanal, setSalvandoCanal] = useState(false);
  const [testandoWABA, setTestandoWABA] = useState(false);
  const [wabaTeste, setWabaTeste] = useState<{ success: boolean; nome?: string; error?: string } | null>(null);
  const [encerrandoMassa, setEncerrandoMassa] = useState(false);
  const [registrandoWaba, setRegistrandoWaba] = useState(false);

  const formInicial = { nome: "", tipo: "webjs", phoneNumberId: "", wabaId: "", token: "", webhookToken: "", modo: "nenhum", ia: "gpt", apiKey: "", prompt: "", fluxoId: "", equipeId: "", fila: "", pararSeAtendente: true, typebot_url: "", typebot_msg_invalida: "", typebot_msg_boas_vindas: "", modulos: [] as string[] };
  const [form, setForm] = useState(formInicial);

  const [apiKeyTocada, setApiKeyTocada] = useState(false);
  const [tokenTocado, setTokenTocado] = useState(false);

  // 🔒 Form de novo canal já vem com a equipe travada (pro usuário restrito)
  const equipeIdInicial = travadoEquipe && equipeForcadaCon ? equipeForcadaCon : "";
  const nomeEquipeForcada = equipes.find(e => String(e.id) === equipeForcadaCon)?.nome || "Minha equipe";
  const novoForm = () => ({ ...formInicial, equipeId: equipeIdInicial });

  // Carrega Facebook SDK uma vez (só se FB_APP_ID estiver configurado)
  useEffect(() => {
    if (!FB_APP_ID || window.FB || document.getElementById("facebook-jssdk")) return;
    window.fbAsyncInit = function () {
      window.FB.init({ appId: FB_APP_ID, cookie: true, xfbml: false, version: "v21.0" });
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  const IS = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" };
  const TA = { ...IS, height: 90, resize: "vertical" as const };
  const cardStyle = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)", transition: "all 0.15s" };

  const wa = async (rota: string, body?: object) => {
    if (body !== undefined) {
      const resp = await fetch(`/api/whatsapp?rota=${rota}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return resp.json();
    }
    const resp = await fetch(`/api/whatsapp?rota=${rota}`);
    return resp.json();
  };

  const fetchConexoes = async () => {
    const { data } = await supabase.from("conexoes").select("*").order("created_at", { ascending: false });
    setConexoes(data || []);
  };

  const fetchFluxos = async () => {
    const { data } = await supabase.from("fluxos").select("id, nome, ativo").order("created_at", { ascending: false });
    setFluxos(data || []);
  };

  const fetchFilas = async () => {
    try {
      // ⚠️ UNITA: a tabela filas NÃO tem coluna "conexao" (era do Wolf) — pedir coluna
      // inexistente fazia o Supabase retornar erro e a lista vinha VAZIA ("Nenhuma fila").
      const { data } = await supabase.from("filas").select("id, nome, equipe_id").eq("ativo", true).order("nome", { ascending: true });
      setFilasBanco(data || []);
    } catch (e) { console.error("Erro ao buscar filas:", e); setFilasBanco([]); }
  };

  const fetchEquipes = async () => {
    try {
      const { data } = await supabase.from("equipes").select("id, nome, ativo").eq("ativo", true).order("nome", { ascending: true });
      setEquipes(data || []);
    } catch (e) { console.error("Erro ao buscar equipes:", e); setEquipes([]); }
  };

  const verificarStatusWaba = async (canalId: number) => {
    try {
      const resp = await fetch(`${UNITAZAP_URL}/waba/verificar-status?canalId=${canalId}`);
      return await resp.json();
    } catch (e) { return { success: false, status: "desconectado" }; }
  };

  useEffect(() => {
    fetchConexoes();
    fetchFluxos();
    fetchFilas();
    fetchEquipes();

    const ch = supabase.channel("conexoes_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "conexoes" }, () => fetchConexoes())
      .on("postgres_changes", { event: "*", schema: "public", table: "filas" }, () => fetchFilas())
      .on("postgres_changes", { event: "*", schema: "public", table: "equipes" }, () => fetchEquipes())
      .subscribe();

    // Polling de status dos canais (a cada 5s)
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${UNITAZAP_URL}/status`);
        const data = await resp.json();
        if (data.sessoes && Array.isArray(data.sessoes)) {
          const { data: canaisBanco } = await supabase.from("conexoes").select("*");
          if (!canaisBanco) return;
          for (const c of canaisBanco) {
            if (c.tipo === "webjs") {
              const sessaoVPS = data.sessoes.find((s: any) => s.canalId === c.id);
              if (!sessaoVPS) continue;
              const statusReal = sessaoVPS.status === "conectado" ? "conectado" : "desconectado";
              const numeroReal = sessaoVPS.numero || "";
              if (c.status !== statusReal || (statusReal === "conectado" && c.numero !== numeroReal)) {
                await supabase.from("conexoes").update({ status: statusReal, numero: numeroReal }).eq("id", c.id);
              }
            } else if (c.tipo === "waba") {
              const wabaStatus = await verificarStatusWaba(c.id);
              if (wabaStatus.success) {
                const statusReal = wabaStatus.status;
                const numeroReal = wabaStatus.numero || c.numero;
                if (c.status !== statusReal || c.numero !== numeroReal) {
                  await supabase.from("conexoes").update({ status: statusReal, numero: numeroReal }).eq("id", c.id);
                }
              }
            }
          }
        }
      } catch (e) {}
      fetchConexoes();
    }, 5000);

    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, []);

  // POLLING DE QR CODE
  useEffect(() => {
    if (!qrPolling || !showModalQR || !qrCanalId) return;
    let tentativas = 0;
    const interval = setInterval(async () => {
      tentativas++;
      setQrTentativas(tentativas);
      try {
        const resp = await fetch(`${UNITAZAP_URL}/qr-data?canalId=${qrCanalId}`, { cache: "no-store" });
        if (!resp.ok) { console.warn(`[QR poll] status HTTP ${resp.status} — tentativa ${tentativas}`); return; }
        const data = await resp.json();
        if (data.qr && data.qr !== qrImageUrl) setQrImageUrl(data.qr);
        if (data.status === "conectado") {
          setQrConectado(true);
          setQrNumero(data.numero || "");
          setQrPolling(false);
          await supabase.from("conexoes").update({ status: "conectado", numero: data.numero || "Conectado" }).eq("id", qrCanalId);
          await fetchConexoes();
          setTimeout(() => { setShowModalQR(false); setQrImageUrl(""); setQrTentativas(0); }, 800);
        }
      } catch (e: any) { console.warn(`[QR poll] erro fetch:`, e?.message || e); }
    }, 1500);
    return () => clearInterval(interval);
  }, [qrPolling, showModalQR, qrCanalId]);

  // Detecção via estado (realtime/banco)
  useEffect(() => {
    if (!showModalQR || !qrCanalId || qrConectado) return;
    const canal = conexoes.find(c => c.id === qrCanalId);
    if (canal && canal.status === "conectado") {
      setQrConectado(true);
      setQrNumero(canal.numero || "");
      setQrPolling(false);
      setTimeout(() => { setShowModalQR(false); setQrImageUrl(""); setQrTentativas(0); }, 800);
    }
  }, [conexoes, showModalQR, qrCanalId, qrConectado]);

  const registrarNumeroWaba = async (c: Conexao) => {
    const usarPinPadrao = confirm(`🟢 Ativar o número na Meta?\n\nCanal: ${c.nome}\nNúmero: ${c.numero}\n\nClique OK pra usar o PIN padrão (000000).\nClique CANCELAR se você configurou um PIN personalizado (2FA).`);
    let pin = "000000";
    if (!usarPinPadrao) {
      const pinCustom = prompt("Digite seu PIN de 6 dígitos (2FA):", "");
      if (!pinCustom) return;
      if (!/^\d{6}$/.test(pinCustom)) { notify("PIN deve ter exatamente 6 dígitos", "aviso", "Digite os 6 números do seu PIN de 2 fatores"); return; }
      pin = pinCustom;
    }
    setRegistrandoWaba(true); setShowMenuEngrenagem(null);
    try {
      const resp = await fetch(`/api/whatsapp?rota=waba/registrar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canalId: c.id, pin }),
      });
      const data = await resp.json();
      if (data.success) {
        notify("Número ativado na Meta!", "sucesso", "Agora está ONLINE e pode receber mensagens");
        await fetchConexoes();
      } else {
        const codigo = data.codigo;
        let mensagemErro = data.error || "Erro desconhecido";
        let dica = "";
        if (codigo === 131000 || mensagemErro.includes("PIN")) dica = "\n\n💡 Dica: o número tem 2FA. Clique Cancelar no primeiro popup pra digitar PIN.";
        else if (mensagemErro.toLowerCase().includes("too many")) dica = "\n\n💡 Aguarde uns minutos antes de tentar de novo.";
        else if (codigo === 133010) dica = "\n\n💡 Número já está registrado!";
        notify(traduzirErro({ error: mensagemErro, codigo }), "erro", dica.replace(/^\n\n💡 ?/, "") || undefined);
      }
    } catch (e: any) { notify("Operação falhou", "erro", traduzirErro(e)); }
    setRegistrandoWaba(false);
  };

  const encerrarAtendimentosEmMassa = async (tipo: "aguardando" | "abertos", c: Conexao) => {
    const statusAlvo = tipo === "aguardando" ? ["pendente"] : ["aberto", "em_atendimento"];
    const labelTipo = tipo === "aguardando" ? "aguardando" : "abertos";
    const { data: atendimentos, error: errBusca } = await supabase.from("atendimentos").select("id, numero, nome").eq("canal_id", c.id).in("status", statusAlvo);
    if (errBusca) { notify("Erro ao buscar atendimentos", "erro", traduzirErro(errBusca)); return; }
    const total = atendimentos?.length || 0;
    if (total === 0) { notify(`Não há atendimentos ${labelTipo} em "${c.nome}"`, "info"); setShowMenuEngrenagem(null); return; }
    if (!confirm(`⚠️ ATENÇÃO — Canal: ${c.nome}\n\nVocê está prestes a ENCERRAR ${total} atendimento(s) ${labelTipo}.\n\nDeseja continuar?`)) return;
    setEncerrandoMassa(true); setShowMenuEngrenagem(null);
    try {
      const { error: errUpdate } = await supabase.from("atendimentos").update({ status: "resolvido" }).eq("canal_id", c.id).in("status", statusAlvo);
      if (errUpdate) throw errUpdate;
      const mensagensSistema = (atendimentos || []).map(a => ({ numero: a.numero, mensagem: `Chat encerrado em massa (${labelTipo}) por: Sistema`, de: "sistema", canal_id: c.id }));
      if (mensagensSistema.length > 0) { for (let i = 0; i < mensagensSistema.length; i += 100) { const lote = mensagensSistema.slice(i, i + 100); await supabase.from("mensagens").insert(lote); } }
      try { await supabase.from("fluxo_sessoes").update({ status: "finalizado" }).eq("status", "ativo"); } catch (e) {}
      notify(`${total} atendimento(s) ${labelTipo} encerrado(s)`, "sucesso");
    } catch (e: any) { notify("Operação falhou", "erro", traduzirErro(e)); }
    setEncerrandoMassa(false);
  };

  const testarWABA = async () => {
    if (!form.phoneNumberId || !form.token) { notify("Preencha Phone Number ID e Token", "aviso"); return; }
    setTestandoWABA(true); setWabaTeste(null);
    try {
      const resp = await fetch(`/api/whatsapp?rota=waba/testar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumberId: form.phoneNumberId, token: form.token }) });
      setWabaTeste(await resp.json());
    } catch { setWabaTeste({ success: false, error: "Erro ao conectar!" }); }
    setTestandoWABA(false);
  };

  const abrirEditar = (c: Conexao) => {
    setEditandoId(c.id);
    const equipeDaFila = filasBanco.find(f => f.nome === c.fila)?.equipe_id;
    setForm({ nome: c.nome, tipo: c.tipo, phoneNumberId: c.phone_number_id || "", wabaId: c.waba_id || "", token: "", webhookToken: c.webhook_token || "", modo: c.modo, ia: c.ia, apiKey: "", prompt: c.prompt || "", fluxoId: c.fluxo_id || "", equipeId: equipeDaFila ? String(equipeDaFila) : (travadoEquipe && equipeForcadaCon ? equipeForcadaCon : ""), fila: c.fila || "", pararSeAtendente: c.parar_se_atendente, typebot_url: c.typebot_url || "", typebot_msg_invalida: c.typebot_msg_invalida || "", typebot_msg_boas_vindas: c.typebot_msg_boas_vindas || "", modulos: Array.isArray(c.modulos) ? c.modulos : [] });
    setApiKeyTocada(false); setTokenTocado(false); setShowModalNovoCanal(true); setShowMenuEngrenagem(null);
    fetchFluxos(); fetchFilas(); fetchEquipes();
  };

  const toggleMetaFlag = async (canal: any, flag: "instagram_ativo" | "messenger_ativo") => {
    try {
      const novoValor = !canal[flag];
      const { error } = await supabase.from("conexoes").update({ [flag]: novoValor }).eq("id", canal.id);
      if (error) { notify("Falha ao atualizar canal", "erro", traduzirErro(error)); return; }
      await fetchConexoes();
    } catch (err: any) { notify("Falha de rede", "erro", traduzirErro(err)); }
  };

  const conectarMeta = () => {
    if (!FB_APP_ID || !FB_CONFIG_ID) { notify("Facebook OAuth não configurado", "aviso", "Configure NEXT_PUBLIC_FB_APP_ID e NEXT_PUBLIC_FB_CONFIG_ID no .env"); return; }
    if (!window.FB) { notify("Sistema do Facebook carregando", "aviso", "Aguarde 2 segundos e tente novamente"); return; }
    setConectandoMeta(true);
    setResultadoMeta(null);
    window.FB.login(
      (response: any) => {
        if (!response.authResponse) { setConectandoMeta(false); setResultadoMeta({ sucesso: false, mensagem: "Você cancelou a conexão." }); return; }
        const accessToken = response.authResponse.accessToken;
        (async () => {
          try {
            const r = await fetch(`${META_BASE}/auth/listar-pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }) });
            const data = await r.json();
            if (data.sucesso && Array.isArray(data.pages)) {
              if (data.pages.length === 0) { setResultadoMeta({ sucesso: false, mensagem: "Nenhuma fan page encontrada nessa conta Facebook." }); }
              else { setPagesDisponiveis(data.pages); setPagesSelecionadas(new Set()); setShowSelecaoPages(true); }
            } else { setResultadoMeta({ sucesso: false, mensagem: data.erro || "Erro ao listar pages." }); }
          } catch (err: any) { setResultadoMeta({ sucesso: false, mensagem: "Erro de rede: " + (err.message || "desconhecido") }); }
          finally { setConectandoMeta(false); }
        })();
      },
      { config_id: FB_CONFIG_ID, response_type: "token" }
    );
  };

  const togglePage = (pageId: string) => {
    setPagesSelecionadas(prev => { const novo = new Set(prev); if (novo.has(pageId)) novo.delete(pageId); else novo.add(pageId); return novo; });
  };

  const confirmarSelecaoPages = async () => {
    if (pagesSelecionadas.size === 0) { notify("Selecione ao menos 1 fan page", "aviso"); return; }
    const pagesEscolhidas = pagesDisponiveis.filter(p => pagesSelecionadas.has(p.id));
    setConectandoMeta(true);
    try {
      const r = await fetch(`${META_BASE}/auth/conectar-pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages: pagesEscolhidas }) });
      const data = await r.json();
      if (data.sucesso) { setResultadoMeta({ sucesso: true, mensagem: `${data.pages_processadas} fan page(s) conectada(s)!`, pages: data.resultados }); await fetchConexoes(); setShowSelecaoPages(false); }
      else { setResultadoMeta({ sucesso: false, mensagem: data.erro || "Erro ao conectar pages." }); }
    } catch (err: any) { setResultadoMeta({ sucesso: false, mensagem: "Erro de rede: " + (err.message || "desconhecido") }); }
    finally { setConectandoMeta(false); }
  };

  const salvarCanal = async () => {
    if (!editandoId && form.tipo === "meta_oauth") { notify("Canal Meta já conectado", "info", "Clique em 'Concluir' pra fechar este modal"); return; }
    if (!isDono) { notify("Sem permissão", "erro", "Apenas administradores podem gerenciar canais"); return; }
    if (!form.nome.trim()) { notify("Digite o nome do canal", "aviso"); return; }
    if (!form.fila) { notify("Selecione uma fila", "aviso", "Se não tem fila cadastrada, vá em Configurações → Filas"); return; }
    if (!editandoId && form.tipo === "waba" && (!form.phoneNumberId || !form.token)) { notify("Preencha Phone Number ID e Token", "aviso"); return; }
    if (!editandoId && form.modo === "ia" && !form.apiKey) { notify("Digite a API Key da IA", "aviso"); return; }
    if (form.modo === "typebot" && !form.typebot_url?.trim()) { notify("Cole a URL de publicação do Typebot", "aviso"); return; }

    setSalvandoCanal(true);
    try {
      const fluxoSel = fluxos.find(f => f.id.toString() === form.fluxoId);
      const payload: any = {
        nome: form.nome, modo: form.modo, ia: form.ia, fluxo_id: form.fluxoId, fluxo_nome: fluxoSel?.nome || "",
        fila: form.fila, prompt: form.prompt, parar_se_atendente: form.pararSeAtendente,
        typebot_url: form.typebot_url || "",
        typebot_msg_invalida: form.typebot_msg_invalida || "Desculpe, não entendi sua resposta. Pode tentar de novo?",
        typebot_msg_boas_vindas: form.typebot_msg_boas_vindas || "",
        modulos: form.modulos || [],
      };
      if (apiKeyTocada || !editandoId) payload.api_key = form.apiKey;

      if (editandoId) {
        if (form.tipo === "waba") {
          if (form.phoneNumberId) payload.phone_number_id = form.phoneNumberId;
          if (form.wabaId) payload.waba_id = form.wabaId;
          if (form.webhookToken) payload.webhook_token = form.webhookToken;
          if (tokenTocado && form.token) payload.token_waba = form.token;
        }
        await supabase.from("conexoes").update(payload).eq("id", editandoId);
        setEditandoId(null);
        try { await wa("configurar-ia", { canalId: editandoId, ia: form.ia, apiKey: form.apiKey, prompt: form.prompt, fila: form.fila, modo: form.modo }); } catch (e) {}
        notify("Canal atualizado", "sucesso");
      } else {
        let novoId: number | null = null;
        if (form.tipo === "waba") {
          const webhookToken = form.webhookToken || `unita_${Date.now()}`;
          const { data: inserted, error: insErr } = await supabase.from("conexoes").insert([{
            tipo: "waba", status: "desconectado",
            numero: wabaTeste?.nome || form.phoneNumberId,
            phone_number_id: form.phoneNumberId, waba_id: form.wabaId,
            token_waba: form.token, webhook_token: webhookToken,
            ...payload
          }]).select().single();
          if (insErr) throw insErr;
          novoId = inserted.id;
        } else {
          const { data: inserted, error: insErr } = await supabase.from("conexoes").insert([{
            tipo: "webjs", status: "desconectado", numero: "", ...payload
          }]).select().single();
          if (insErr) throw insErr;
          novoId = inserted.id;
        }
        if (novoId) { try { await wa("canal/criar", { canalId: novoId }); } catch (e) { console.error("Erro ao criar sessão no UnitaZAP:", e); } }
        notify("Canal criado", "sucesso");
      }
      await fetchConexoes();
      setShowModalNovoCanal(false); setForm(novoForm()); setWabaTeste(null);
      setApiKeyTocada(false); setTokenTocado(false);
    } catch (e: any) { notify("Operação falhou", "erro", traduzirErro(e)); }
    setSalvandoCanal(false);
  };

  const abrirQR = async (id: number) => {
    const canal = conexoes.find(c => c.id === id);
    if (!canal) return;
    setQrCanalId(id); setResetando(true); setShowModalQR(true);
    setQrImageUrl(""); setQrConectado(false); setQrNumero(""); setQrTentativas(0);
    try { await wa("resetar", { canalId: id }); } catch (e) {}
    await supabase.from("conexoes").update({ status: "desconectado", numero: "" }).eq("id", id);
    await fetchConexoes(); setResetando(false); setQrPolling(true);
  };

  const reconectarCanal = async (c: Conexao) => {
    if (!confirm(`🔄 Reconectar ${c.nome}?\n\nVai destruir a conexão atual e recriar SEM perder o login do WhatsApp.\nUse isso quando o canal travou ou está com erro.\n\n(Se quiser trocar o número/conta, use "Resetar" no menu da engrenagem.)`)) return;
    setShowMenuEngrenagem(null);
    try {
      const data = await wa("reconectar", { canalId: c.id });
      if (!data.success) { notify("Falha ao reconectar", "erro", traduzirErro(data)); return; }
      await supabase.from("conexoes").update({ status: "desconectado" }).eq("id", c.id);
      await fetchConexoes();
      if (data.sessao_salva === false) {
        notify(`${c.nome} não tem sessão salva`, "aviso", "Vou abrir o QR Code pra você escanear");
        setQrCanalId(c.id); setResetando(false); setShowModalQR(true);
        setQrImageUrl(""); setQrConectado(false); setQrNumero(""); setQrTentativas(0);
        setQrPolling(true);
      } else {
        notify(`${c.nome} reconectando...`, "sucesso", "O login será restaurado automaticamente. Não precisa escanear QR");
      }
    } catch (e: any) { notify("Falha ao reconectar", "erro", traduzirErro(e)); }
  };

  const desconectarCanal = async (c: Conexao) => {
    if (!confirm(`Desconectar ${c.nome}? Isso vai desconectar o WhatsApp.`)) return;
    try {
      await wa("desconectar", { canalId: c.id });
      await supabase.from("conexoes").update({ status: "desconectado", numero: "" }).eq("id", c.id);
      await fetchConexoes();
      notify("Canal desconectado", "sucesso");
    } catch (e: any) { notify("Operação falhou", "erro", traduzirErro(e)); }
  };

  const excluirCanal = async (id: number) => {
    if (!isDono) { notify("Sem permissão", "erro", "Apenas administradores podem excluir canais"); return; }
    if (!confirm("Excluir esse canal?\n\nTodo o histórico vai ser preservado mas o canal será removido.")) return;
    const canal = conexoes.find(c => c.id === id);
    if (!canal) { notify("Canal não encontrado", "erro"); return; }
    if (canal.tipo === "webjs") { try { await wa("desconectar", { canalId: id }); } catch (e) {} }
    await supabase.from("conexoes").delete().eq("id", id);
    await fetchConexoes(); setShowMenuEngrenagem(null);
  };

  const modoColor: Record<string, string> = { nenhum: "#6b7280", ia: "#10b981", fluxo: "#8b5cf6", typebot: "#a78bfa" };
  const iaLabel: Record<string, string> = { gpt: "ChatGPT", claude: "Claude AI", gemini: "Gemini", deepseek: "DeepSeek" };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button onClick={onChange} style={{ width: 44, height: 24, background: value ? "#16a34a" : "#d1d5db", borderRadius: 12, cursor: "pointer", border: "none", position: "relative", flexShrink: 0, transition: "background 0.2s", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)" }}>
      <div style={{ width: 18, height: 18, background: "white", borderRadius: "50%", position: "absolute", top: 3, left: value ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );

  const filasFiltradas = filasBanco.filter(f => !form.equipeId || String(f.equipe_id || "") === form.equipeId);

  // 🔒 Lista de canais visíveis: restrito vê só os da equipe dele (+ sem equipe)
  const conexoesVisiveis = travadoEquipe
    ? conexoes.filter(c => {
        const eqId = filasBanco.find(f => f.nome === c.fila)?.equipe_id;
        return !eqId || String(eqId) === equipeForcadaCon;
      })
    : conexoes;

  const fecharModalNovoCanal = () => { setShowModalNovoCanal(false); setForm(novoForm()); setWabaTeste(null); setEditandoId(null); setApiKeyTocada(false); setTokenTocado(false); setResultadoMeta(null); setPagesDisponiveis([]); setPagesSelecionadas(new Set()); };

  const abrirNovoCanal = () => { setShowModalNovoCanal(true); setEditandoId(null); setForm(novoForm()); setApiKeyTocada(false); setTokenTocado(false); fetchFluxos(); fetchFilas(); fetchEquipes(); };


  // 🛡️ Guard visual
  if (perm.carregando) {
    return <div style={{ padding: 24, color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</div>;
  }
  if (!podeAcessar) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
        <p style={{ color: "#1f2937", fontWeight: 700, margin: "0 0 4px" }}>Sem acesso</p>
        <p style={{ color: "#9ca3af", fontSize: 12 }}>Grupo: <b>{perm.grupoNome || "(sem grupo)"}</b></p>
      </div>
    );
  }
  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", height: "100vh", background: "#f8fafc" }}>

      {/* MODAL QR CODE */}
      {showModalQR && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...cardStyle, padding: 32, width: 420, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px", boxShadow: "0 8px 20px rgba(22,163,74,0.25)" }}>
              <span style={{ filter: "saturate(0) brightness(2)" }}>📱</span>
            </div>
            <h2 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Conectar WhatsApp</h2>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 20px" }}>Escaneie o QR Code com seu WhatsApp</p>
            <div style={{ background: "#f9fafb", borderRadius: 14, padding: 16, minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, border: "1px solid #e5e7eb" }}>
              {resetando ? <p style={{ color: "#f59e0b", fontSize: 14, fontWeight: 600 }}>⏳ Iniciando sessão...</p>
                : qrConectado ? <div><p style={{ fontSize: 48, margin: "0 0 8px" }}>✅</p><p style={{ color: "#16a34a", fontSize: 16, fontWeight: 700, margin: 0 }}>WhatsApp Conectado!</p>{qrNumero && <p style={{ color: "#6b7280", fontSize: 13, margin: "8px 0 0" }}>{qrNumero}</p>}</div>
                : qrImageUrl ? <img src={qrImageUrl} alt="QR Code" style={{ width: 220, height: 220, borderRadius: 8 }} />
                : <div><p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px" }}>⏳ Gerando QR Code...</p><p style={{ color: "#9ca3af", fontSize: 11, margin: 0 }}>Aguarde alguns segundos</p></div>}
            </div>

            {qrPolling && !qrConectado && qrTentativas > 0 && (
              <p style={{ color: "#9ca3af", fontSize: 11, margin: "0 0 10px" }}>🔄 Verificando conexão... ({qrTentativas}x)</p>
            )}

            {qrPolling && !qrConectado && qrTentativas >= 20 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 14, marginBottom: 14, textAlign: "left" }}>
                <p style={{ color: "#92400e", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>⚠️ Tá demorando mais que o normal</p>
                <p style={{ color: "#78350f", fontSize: 11, margin: "0 0 10px", lineHeight: 1.4 }}>Se já aparece conectado no celular, clica em <b>Já Conectei!</b> pra atualizar. Senão, tenta gerar um novo QR.</p>
                <button onClick={async () => {
                  if (!qrCanalId) return;
                  try {
                    const resp = await fetch(`${UNITAZAP_URL}/qr-data?canalId=${qrCanalId}`, { cache: "no-store" });
                    const data = await resp.json();
                    if (data.status === "conectado") {
                      await supabase.from("conexoes").update({ status: "conectado", numero: data.numero || "Conectado" }).eq("id", qrCanalId);
                      await fetchConexoes();
                      setQrConectado(true); setQrNumero(data.numero || "");
                      setTimeout(() => { setShowModalQR(false); setQrImageUrl(""); setQrTentativas(0); }, 800);
                    } else { notify("Backend ainda não reconheceu a conexão", "aviso", `Status atual: ${data.status}. Tenta de novo ou recria o QR.`); }
                  } catch (e: any) { notify("Falha ao verificar QR", "erro", traduzirErro(e)); }
                }} style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>🔍 Verificar agora</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => { setShowModalQR(false); setQrPolling(false); setQrImageUrl(""); setQrTentativas(0); }} style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Fechar</button>
              {!qrConectado && <button onClick={async () => { if (qrCanalId) { await supabase.from("conexoes").update({ status: "conectado", numero: qrNumero || "Conectado" }).eq("id", qrCanalId); await fetchConexoes(); } setShowModalQR(false); setQrPolling(false); setQrTentativas(0); }} style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(22,163,74,0.3)" }}>✅ Já Conectei!</button>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO/EDITAR CANAL */}
      {showModalNovoCanal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...cardStyle, width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", maxHeight: "92vh", overflow: "hidden" }}>
            <div style={{ padding: "20px 28px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: 0 }}>{editandoId ? "✏️ Editar Canal" : "➕ Novo Canal"}</h2>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "4px 0 0" }}>{editandoId ? "Altere as configurações" : `${conexoesVisiveis.length} canais cadastrados`}</p>
              </div>
              <button onClick={fecharModalNovoCanal} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
              {!editandoId && (
                <div>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>1. Tipo de Canal</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { key: "webjs", icon: "📱", label: "WhatsApp Web", desc: "Conexão via QR Code", cor: "#16a34a" },
                      { key: "waba", icon: "🔗", label: "API Meta (WABA)", desc: "API oficial do WhatsApp", cor: "#2563eb" },
                      { key: "meta_oauth", icon: "📲", label: "Facebook / Instagram", desc: "Login com Facebook", cor: "#e1306c" }
                    ].map(t => (
                      <button key={t.key} onClick={() => setForm(p => ({ ...p, tipo: t.key }))}
                        style={{
                          background: form.tipo === t.key ? `${t.cor}10` : "#f9fafb",
                          border: `2px solid ${form.tipo === t.key ? t.cor : "#e5e7eb"}`,
                          borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                        }}>
                        <p style={{ fontSize: 20, margin: "0 0 4px" }}>{t.icon}</p>
                        <p style={{ color: form.tipo === t.key ? t.cor : "#1f2937", fontSize: 13, fontWeight: 700, margin: "0 0 2px" }}>{t.label}</p>
                        <p style={{ color: "#9ca3af", fontSize: 11, margin: 0 }}>{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" }}>{editandoId ? "1" : "2"}. Nome do Canal</p>
                <input placeholder="Ex: WhatsApp Vendas..." value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} style={IS} />
                {/* 📂 Módulos onde este canal aparece. Vazio = não aparece em lugar nenhum. */}
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>📂 Aparece nos módulos</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {([
                      { id: "cobranca", label: "💰 Cobrança" },
                      { id: "rh", label: "👥 RH" },
                      { id: "suporte", label: "🛟 Suporte" },
                      { id: "chatbot", label: "🤖 Chatbot / Vendas" },
                    ] as { id: string; label: string }[]).map(m => {
                      const marcado = (form.modulos || []).includes(m.id);
                      return (
                        <button key={m.id} type="button"
                          onClick={() => setForm(p => {
                            const atual = p.modulos || [];
                            return { ...p, modulos: marcado ? atual.filter(x => x !== m.id) : [...atual, m.id] };
                          })}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1.5px solid ${marcado ? "#16a34a" : "#e5e7eb"}`, background: marcado ? "#f0fdf4" : "#fff", color: marcado ? "#15803d" : "#6b7280", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          <span style={{ fontSize: 13 }}>{marcado ? "☑" : "☐"}</span> {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "6px 0 0" }}>
                    Marque onde as conversas deste canal devem aparecer. Sem nenhum marcado, o canal não aparece em nenhum módulo.
                  </p>
                </div>
              </div>
              {editandoId && (form.tipo === "instagram" || form.tipo === "messenger") && (
                <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 14, border: "1px solid #bbf7d0" }}>
                  <p style={{ color: "#15803d", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                    {form.tipo === "instagram" ? "📷 Canal Instagram" : "💬 Canal Messenger"} conectado via Login com Facebook.
                  </p>
                  <p style={{ color: "#6b7280", fontSize: 11, margin: "6px 0 0", lineHeight: 1.4 }}>
                    Pra reconectar, delete este canal e crie um novo via "Facebook / Instagram".
                  </p>
                </div>
              )}
              {!editandoId && form.tipo === "meta_oauth" && (
                <div>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>3. Conectar conta Facebook</p>
                  <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 14, border: "1px solid #e5e7eb" }}>
                    <p style={{ color: "#374151", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                      Vamos conectar todas as suas <b>fan pages do Facebook</b> e respectivas contas do <b>Instagram Business</b> automaticamente.
                    </p>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                      Você logará no Facebook (popup oficial), autorizará as permissões necessárias e o sistema criará os canais sozinho.
                    </p>
                    <button onClick={conectarMeta} disabled={conectandoMeta}
                      style={{ background: conectandoMeta ? "#1d4ed8" : "#1877f2", color: "white", border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 700, cursor: conectandoMeta ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(24,119,242,0.3)" }}>
                      {conectandoMeta ? "⏳ Conectando..." : "📲 Conectar com Facebook"}
                    </button>
                    {resultadoMeta && (
                      <div style={{ background: resultadoMeta.sucesso ? "#f0fdf4" : "#fef2f2", border: `1px solid ${resultadoMeta.sucesso ? "#bbf7d0" : "#fecaca"}`, borderRadius: 10, padding: 14 }}>
                        <p style={{ color: resultadoMeta.sucesso ? "#15803d" : "#dc2626", fontSize: 13, margin: "0 0 6px", fontWeight: 700 }}>
                          {resultadoMeta.sucesso ? "✅ " : "❌ "}{resultadoMeta.mensagem}
                        </p>
                        {resultadoMeta.pages && resultadoMeta.pages.length > 0 && (
                          <ul style={{ margin: "8px 0 0", padding: "0 0 0 18px", color: "#15803d", fontSize: 12 }}>
                            {resultadoMeta.pages.map((p: any, i: number) => (
                              <li key={i}>
                                <b>{p.page_name}</b>
                                {p.instagram_username && ` + Instagram @${p.instagram_username}`}
                                {p.erro && <span style={{ color: "#dc2626" }}> — Erro: {p.erro}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {form.tipo === "waba" && (
                <div>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>{editandoId ? "2" : "3"}. Credenciais da API Meta</p>
                  <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: "1px solid #e5e7eb" }}>
                    <div><label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>Phone Number ID *</label><input placeholder="123456789012345" value={form.phoneNumberId} onChange={e => setForm(p => ({ ...p, phoneNumberId: e.target.value }))} style={IS} /></div>
                    <div><label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>WABA ID</label><input placeholder="123456789012345" value={form.wabaId} onChange={e => setForm(p => ({ ...p, wabaId: e.target.value }))} style={IS} /></div>
                    <div><label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>Token Permanente {editandoId ? "" : "*"}</label><input type="password" placeholder={editandoId ? "Deixe em branco pra manter o token atual" : "EAAxxxxx..."} value={form.token} onChange={e => { setForm(p => ({ ...p, token: e.target.value })); setTokenTocado(true); }} style={IS} /></div>
                    <button onClick={testarWABA} disabled={testandoWABA} style={{ background: testandoWABA ? "#1e40af" : "#2563eb15", color: "#2563eb", border: "1px solid #2563eb30", borderRadius: 10, padding: 10, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>{testandoWABA ? "⏳ Testando..." : "🔍 Testar Conexão"}</button>
                    {wabaTeste && <div style={{ background: wabaTeste.success ? "#f0fdf4" : "#fef2f2", border: `1px solid ${wabaTeste.success ? "#bbf7d0" : "#fecaca"}`, borderRadius: 10, padding: 12 }}><p style={{ color: wabaTeste.success ? "#15803d" : "#dc2626", fontSize: 13, margin: 0, fontWeight: 700 }}>{wabaTeste.success ? `✅ ${wabaTeste.nome}` : `❌ ${wabaTeste.error}`}</p></div>}
                    <div style={{ background: "#ffffff", borderRadius: 10, padding: 12, border: "1px solid #e5e7eb" }}>
                      <p style={{ color: "#6b7280", fontSize: 11, margin: "0 0 4px", textTransform: "uppercase", fontWeight: 600 }}>URL do Webhook</p>
                      <p style={{ color: "#16a34a", fontSize: 12, fontWeight: 700, margin: 0, wordBreak: "break-all" }}>{typeof window !== "undefined" ? `${window.location.origin}/api/webhook/meta` : "/api/webhook/meta"}</p>
                    </div>
                    <div><label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>Token de Verificação</label><input placeholder="meu_token_secreto" value={form.webhookToken} onChange={e => setForm(p => ({ ...p, webhookToken: e.target.value }))} style={IS} /></div>
                    {!editandoId && (
                      <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12, border: "1px solid #bbf7d0" }}>
                        <p style={{ color: "#15803d", fontSize: 11, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase" }}>💡 Importante</p>
                        <p style={{ color: "#166534", fontSize: 11, margin: 0, lineHeight: 1.5 }}>Depois de criar o canal, clique em <b>🟢 Ativar Número na Meta</b> pra deixar seu número online.</p>
                      </div>
                    )}
                    {editandoId && (
                      <div style={{ background: "#fffbeb", borderRadius: 10, padding: 12, border: "1px solid #fde68a" }}>
                        <p style={{ color: "#92400e", fontSize: 11, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" }}>⚠️ Não está recebendo mensagens?</p>
                        <p style={{ color: "#78350f", fontSize: 11, margin: "0 0 6px", lineHeight: 1.5 }}>Pode faltar inscrever o app no WABA. Roda no terminal (substitua o token):</p>
                        <code style={{ background: "#f3f4f6", padding: "6px 8px", borderRadius: 6, color: "#1f2937", fontSize: 10, display: "block", wordBreak: "break-all", border: "1px solid #e5e7eb" }}>{`curl -X POST "https://graph.facebook.com/v19.0/${form.wabaId || "WABA_ID"}/subscribed_apps" -H "Authorization: Bearer SEU_TOKEN"`}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>{editandoId ? "2" : form.tipo === "waba" ? "4" : "3"}. Automação</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { key: "nenhum", icon: "🚫", label: "Sem automação", desc: "Só humano", cor: "#6b7280" },
                    { key: "ia", icon: "🤖", label: "Usar IA", desc: "Claude, GPT...", cor: "#10b981" },
                    { key: "fluxo", icon: "🔀", label: "Usar Fluxo", desc: "Chatbot visual", cor: "#8b5cf6" },
                    { key: "typebot", icon: "🎯", label: "Typebot", desc: "URL do Typebot", cor: "#a78bfa" },
                  ].map(m => (
                    <button key={m.key} onClick={() => setForm(p => ({ ...p, modo: m.key }))} style={{
                      background: form.modo === m.key ? `${m.cor}10` : "#f9fafb",
                      border: `2px solid ${form.modo === m.key ? m.cor : "#e5e7eb"}`,
                      borderRadius: 12, padding: "12px 10px", cursor: "pointer", textAlign: "center", transition: "all 0.15s",
                    }}>
                      <p style={{ fontSize: 22, margin: "0 0 4px" }}>{m.icon}</p>
                      <p style={{ color: form.modo === m.key ? m.cor : "#1f2937", fontSize: 12, fontWeight: 700, margin: "0 0 2px" }}>{m.label}</p>
                      <p style={{ color: "#9ca3af", fontSize: 10, margin: 0 }}>{m.desc}</p>
                    </button>
                  ))}
                </div>
                {form.modo === "ia" && (
                  <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: "1px solid #e5e7eb" }}>
                    <p style={{ color: "#10b981", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>🤖 Configurar IA</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[{ key: "gpt", label: "💬 ChatGPT", sub: "OpenAI", cor: "#10b981" }, { key: "claude", label: "🧠 Claude AI", sub: "Anthropic", cor: "#8b5cf6" }, { key: "gemini", label: "✨ Gemini", sub: "Google", cor: "#f59e0b" }, { key: "deepseek", label: "🔍 DeepSeek", sub: "DeepSeek AI", cor: "#2563eb" }].map(ia => (
                        <button key={ia.key} onClick={() => { setForm(p => ({ ...p, ia: ia.key, apiKey: "" })); setApiKeyTocada(true); }} style={{
                          background: form.ia === ia.key ? `${ia.cor}10` : "#ffffff",
                          border: `2px solid ${form.ia === ia.key ? ia.cor : "#e5e7eb"}`,
                          borderRadius: 10, padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                        }}>
                          <p style={{ color: form.ia === ia.key ? ia.cor : "#1f2937", fontSize: 13, fontWeight: 700, margin: "0 0 2px" }}>{ia.label}</p>
                          <p style={{ color: "#9ca3af", fontSize: 10, margin: 0 }}>{ia.sub}</p>
                        </button>
                      ))}
                    </div>
                    <div>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>
                        API Key {editandoId && !apiKeyTocada && <span style={{ color: "#10b981", fontSize: 10 }}>(já salva)</span>}
                      </label>
                      <input type="password" placeholder={editandoId ? "Deixe vazio pra manter" : "Cole sua API Key"} value={form.apiKey} onChange={e => { setForm(p => ({ ...p, apiKey: e.target.value })); setApiKeyTocada(true); }} style={IS} />
                    </div>
                    <div><label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>Prompt do sistema</label><textarea placeholder="Ex: Você é um atendente virtual..." value={form.prompt} onChange={e => setForm(p => ({ ...p, prompt: e.target.value }))} style={TA} /></div>
                  </div>
                )}
                {form.modo === "fluxo" && (
                  <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: "1px solid #e5e7eb" }}>
                    <p style={{ color: "#8b5cf6", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>🔀 Selecionar Fluxo</p>
                    {fluxos.length === 0 ? (
                      <div style={{ background: "#ffffff", borderRadius: 10, padding: 16, textAlign: "center", border: "1px solid #e5e7eb" }}>
                        <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 10px" }}>Nenhum fluxo criado ainda</p>
                        <button onClick={() => { router.push("/chatbot/fluxos"); setShowModalNovoCanal(false); }} style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(139,92,246,0.3)" }}>🔀 Criar Fluxo</button>
                      </div>
                    ) : fluxos.map(f => (
                      <button key={f.id} onClick={() => setForm(p => ({ ...p, fluxoId: f.id.toString() }))} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: form.fluxoId === f.id.toString() ? "#8b5cf610" : "#ffffff",
                        border: `2px solid ${form.fluxoId === f.id.toString() ? "#8b5cf6" : "#e5e7eb"}`,
                        borderRadius: 10, padding: "12px 16px", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>🔀</span>
                          <div>
                            <p style={{ color: form.fluxoId === f.id.toString() ? "#8b5cf6" : "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{f.nome}</p>
                            <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>{f.ativo ? "🟢 Ativo" : "⚫ Inativo"}</p>
                          </div>
                        </div>
                        {form.fluxoId === f.id.toString() && <span style={{ color: "#8b5cf6", fontSize: 18, fontWeight: 700 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
                {form.modo === "typebot" && (
                  <div style={{ background: "#f9fafb", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: "1px solid #e5e7eb" }}>
                    <p style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: 0 }}>🎯 Configurar Typebot</p>
                    <p style={{ color: "#6b7280", fontSize: 11, margin: "-4px 0 0", lineHeight: 1.4 }}>Cole a URL de publicação do seu Typebot. O sistema vai usar a API dele pra processar os atendimentos automaticamente.</p>
                    <div>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>URL do Typebot *</label>
                      <input type="text" placeholder="https://typebot.io/meu-bot ou https://seu-typebot.com.br/atendimento" value={form.typebot_url || ""} onChange={e => setForm(p => ({ ...p, typebot_url: e.target.value }))} style={IS} />
                      <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>Cole a URL completa de publicação. Aceita typebot.io e self-hosted.</p>
                    </div>
                    <div>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>Mensagem de boas-vindas (opcional)</label>
                      <input type="text" placeholder="Ex: Olá! Vou te ajudar agora 😊" value={form.typebot_msg_boas_vindas || ""} onChange={e => setForm(p => ({ ...p, typebot_msg_boas_vindas: e.target.value }))} style={IS} />
                    </div>
                    <div>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>Mensagem quando resposta é inválida</label>
                      <input type="text" placeholder="Desculpe, não entendi sua resposta. Pode tentar de novo?" value={form.typebot_msg_invalida || ""} onChange={e => setForm(p => ({ ...p, typebot_msg_invalida: e.target.value }))} style={IS} />
                      <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>Mostrada quando o cliente manda algo que o bloco do Typebot não aceita.</p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>{editandoId ? "3" : form.tipo === "waba" ? "5" : "4"}. Equipe & Fila / Departamento</p>

                {/* Admin: escolhe a equipe (afunila filas). Restrito: equipe fixa. */}
                {equipes.length > 0 && !travadoEquipe && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>👥 Equipe <span style={{ color: "#9ca3af", fontWeight: 400 }}>(afunila as filas)</span></label>
                    <select value={form.equipeId}
                      onChange={e => {
                        const novaEquipe = e.target.value;
                        setForm(p => {
                          const filaAtual = filasBanco.find(f => f.nome === p.fila);
                          const filaContinuaValida = !novaEquipe || (filaAtual && String(filaAtual.equipe_id || "") === novaEquipe);
                          return { ...p, equipeId: novaEquipe, fila: filaContinuaValida ? p.fila : "" };
                        });
                      }} style={IS}>
                      <option value="">👥 Todas as equipes</option>
                      {equipes.map(eq => (<option key={eq.id} value={String(eq.id)}>👥 {eq.nome}</option>))}
                    </select>
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>Escolha a equipe e selecione abaixo qual fila (segmento) deste canal.</p>
                  </div>
                )}
                {equipes.length > 0 && travadoEquipe && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>👥 Equipe</label>
                    <div style={{ ...IS, background: "#faf5ff", border: "1px solid #e9d5ff", color: "#7c3aed", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      👥 {nomeEquipeForcada}
                    </div>
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>O canal será da sua equipe. Selecione abaixo a fila (segmento).</p>
                  </div>
                )}

                <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>📋 Fila / Segmento</label>
                {filasBanco.length === 0 ? (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 22 }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#92400e", fontSize: 13, fontWeight: 700, margin: "0 0 2px" }}>Nenhuma fila cadastrada</p>
                      <p style={{ color: "#78350f", fontSize: 11, margin: 0 }}>Crie filas em <b>Configurações → Filas</b> antes de criar o canal.</p>
                    </div>
                    <button onClick={() => { setShowModalNovoCanal(false); router.push("/crm/configuracoes"); }} style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>Criar fila</button>
                  </div>
                ) : (
                  <>
                    <select value={form.fila} onChange={e => setForm(p => ({ ...p, fila: e.target.value }))} style={IS}>
                      <option value="">Selecione uma fila...</option>
                      {filasFiltradas.map(f => (<option key={f.id} value={f.nome}>📋 {f.nome}{f.conexao ? ` (${f.conexao})` : ""}</option>))}
                    </select>
                    {form.equipeId && filasFiltradas.length === 0 && (
                      <p style={{ color: "#dc2626", fontSize: 11, margin: "6px 0 0", lineHeight: 1.4 }}>⚠️ Essa equipe não tem nenhuma fila cadastrada. Crie uma fila pra ela em <b>Configurações → Filas</b>.</p>
                    )}
                  </>
                )}
                <p style={{ color: "#9ca3af", fontSize: 11, margin: "6px 0 0" }}>Filas e equipes são gerenciadas em <b>Configurações → Filas</b> do CRM.</p>
              </div>
              <div>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>{editandoId ? "4" : form.tipo === "waba" ? "6" : "5"}. Comportamento</p>
                <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e7eb" }}>
                  <div>
                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>🛑 Parar automação quando atendente assumir</p>
                    <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 0" }}>A IA e o fluxo param automaticamente</p>
                  </div>
                  <Toggle value={form.pararSeAtendente} onChange={() => setForm(p => ({ ...p, pararSeAtendente: !p.pararSeAtendente }))} />
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 28px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={fecharModalNovoCanal} style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              {!editandoId && form.tipo === "meta_oauth" ? (
                <button onClick={fecharModalNovoCanal} style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "white", border: "none", borderRadius: 10, padding: "10px 28px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(22,163,74,0.3)" }}>✅ Concluir</button>
              ) : (
                <button onClick={salvarCanal} disabled={salvandoCanal} style={{ background: salvandoCanal ? "#15803d" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "white", border: "none", borderRadius: 10, padding: "10px 28px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(22,163,74,0.3)" }}>{salvandoCanal ? "⏳ Salvando..." : editandoId ? "💾 Salvar" : "✅ Criar Canal"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 8px 20px rgba(22,163,74,0.25)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📱</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Conexões</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0" }}>
              Grupo Unita · {conexoesVisiveis.length} canal(is) cadastrado(s)
              {travadoEquipe && <> · <b style={{ color: "#7c3aed" }}>👥 {nomeEquipeForcada}</b></>}
            </p>
          </div>
        </div>
        <button onClick={abrirNovoCanal}
          style={{
            background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
            color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 13,
            cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
          }}>
          + Novo Canal
        </button>
      </div>

      {/* CARDS DE CONEXÕES */}
      {conexoesVisiveis.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px", boxShadow: "0 12px 24px rgba(22,163,74,0.25)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📱</span>
          </div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>Nenhum canal conectado</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 20px" }}>Crie seu primeiro canal pra começar</p>
          <button onClick={abrirNovoCanal} style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(22,163,74,0.3)" }}>+ Novo Canal</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {conexoesVisiveis.map(c => (
            <div key={c.id} style={{ ...cardStyle, padding: 24, borderTop: `3px solid ${c.status === "conectado" ? "#16a34a" : "#ef4444"}` }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 20px ${c.status === "conectado" ? "rgba(22,163,74,0.12)" : "rgba(239,68,68,0.08)"}`; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: c.tipo === "webjs" ? "#16a34a15" : c.tipo === "meta" ? "#e1306c15" : "#2563eb15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                    {c.tipo === "webjs" ? "📱" : c.tipo === "meta" ? "📲" : "🔗"}
                  </div>
                  <div>
                    <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>{c.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: 0 }}>
                      {c.tipo === "webjs" ? "WhatsApp Web" : c.tipo === "waba" ? "API Meta (WABA)" : c.tipo === "meta" ? "Facebook · Instagram" : c.tipo} · ID {c.id}
                    </p>
                  </div>
                </div>
                <span style={{
                  background: c.status === "conectado" ? "#f0fdf4" : "#fef2f2",
                  color: c.status === "conectado" ? "#16a34a" : "#dc2626",
                  border: `1px solid ${c.status === "conectado" ? "#bbf7d0" : "#fecaca"}`,
                  fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700
                }}>{c.status === "conectado" ? "🟢 Conectado" : "🔴 Desconectado"}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280", fontSize: 12 }}>Automação:</span><span style={{ color: modoColor[c.modo] || "#6b7280", fontSize: 12, fontWeight: 700 }}>{c.modo === "ia" ? `🤖 IA (${iaLabel[c.ia] || c.ia})` : c.modo === "fluxo" ? `🔀 ${c.fluxo_nome}` : c.modo === "typebot" ? `🎯 Typebot` : "🚫 Sem automação"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280", fontSize: 12 }}>Fila:</span><span style={{ color: "#2563eb", fontSize: 12, fontWeight: 600 }}>{c.fila || "—"}</span></div>
                {(() => {
                  const eqId = filasBanco.find(f => f.nome === c.fila)?.equipe_id;
                  const eqNome = eqId ? equipes.find(e => e.id === eqId)?.nome : null;
                  if (!eqNome) return null;
                  return <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280", fontSize: 12 }}>Equipe:</span><span style={{ color: "#a855f7", fontSize: 12, fontWeight: 600 }}>👥 {eqNome}</span></div>;
                })()}
                {c.numero && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280", fontSize: 12 }}>Número:</span><span style={{ color: "#1f2937", fontSize: 12, fontWeight: 600 }}>{c.numero}</span></div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {c.tipo === "webjs" && (c.status === "desconectado"
                  ? <>
                      <button onClick={() => reconectarCanal(c)} title="Tenta reconectar SEM apagar o login" style={{ flex: 1, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "white", border: "none", borderRadius: 10, padding: 9, fontSize: 12, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}>🔄 Reconectar</button>
                      <button onClick={() => abrirQR(c.id)} title="Apaga sessão salva e gera QR novo" style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>📷 QR</button>
                    </>
                  : <><button onClick={() => reconectarCanal(c)} title="Reconectar caso esteja com erro" style={{ flex: 1, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✅ Conectado · 🔄</button><button onClick={() => desconectarCanal(c)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Desconectar</button></>
                )}
                {c.tipo === "waba" && (c.status === "conectado"
                  ? <button disabled style={{ flex: 1, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 700 }}>🔗 API Conectada</button>
                  : <button onClick={() => registrarNumeroWaba(c)} style={{ flex: 1, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "white", border: "none", borderRadius: 10, padding: 9, fontSize: 12, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}>🟢 Ativar Número na Meta</button>
                )}
                {c.tipo === "meta" && (
                  <div style={{ flex: 1, display: "flex", gap: 6 }}>
                    <button onClick={() => toggleMetaFlag(c, "messenger_ativo")} title={c.messenger_ativo ? "Messenger ligado" : "Messenger desligado"}
                      style={{ flex: 1, background: c.messenger_ativo ? "#1877f2" : "#f9fafb", color: c.messenger_ativo ? "white" : "#6b7280", border: `1px solid ${c.messenger_ativo ? "#1877f2" : "#e5e7eb"}`, borderRadius: 10, padding: "9px 4px", fontSize: 13, cursor: "pointer", fontWeight: 700, textAlign: "center", opacity: c.messenger_ativo ? 1 : 0.6 }}>
                      💬 Messenger
                    </button>
                    {c.instagram_business_id ? (
                      <button onClick={() => toggleMetaFlag(c, "instagram_ativo")} title={c.instagram_ativo ? "Instagram ligado" : "Instagram desligado"}
                        style={{ flex: 1, background: c.instagram_ativo ? "#e1306c" : "#f9fafb", color: c.instagram_ativo ? "white" : "#6b7280", border: `1px solid ${c.instagram_ativo ? "#e1306c" : "#e5e7eb"}`, borderRadius: 10, padding: "9px 4px", fontSize: 13, cursor: "pointer", fontWeight: 700, textAlign: "center", opacity: c.instagram_ativo ? 1 : 0.6 }}>
                        📷 Instagram
                      </button>
                    ) : (
                      <div style={{ flex: 1, background: "#f9fafb", color: "#9ca3af", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 4px", fontSize: 11, fontStyle: "italic", textAlign: "center" }}>📷 sem IG</div>
                    )}
                  </div>
                )}
                <div style={{ position: "relative" }}>
                  <button onClick={() => setShowMenuEngrenagem(showMenuEngrenagem === c.id ? null : c.id)} disabled={encerrandoMassa || registrandoWaba}
                    style={{ background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", fontSize: 14, cursor: (encerrandoMassa || registrandoWaba) ? "wait" : "pointer", transition: "all 0.15s" }}>
                    {(encerrandoMassa || registrandoWaba) ? "⏳" : "⚙️"}
                  </button>
                  {showMenuEngrenagem === c.id && (
                    <div style={{ position: "absolute", bottom: 44, right: 0, ...cardStyle, overflow: "hidden", zIndex: 100, minWidth: 240, padding: 4 }}>
                      <button onClick={() => abrirEditar(c)} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#1f2937", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={e => e.currentTarget.style.background = "none"}>✏️ Editar Canal</button>
                      {c.tipo === "webjs" && <button onClick={() => reconectarCanal(c)} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#16a34a", fontSize: 13, cursor: "pointer", textAlign: "left", fontWeight: 700, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"} onMouseLeave={e => e.currentTarget.style.background = "none"}>🔄 Reconectar (preserva login)</button>}
                      {c.tipo === "webjs" && <button onClick={() => { setShowMenuEngrenagem(null); abrirQR(c.id); }} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#1f2937", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={e => e.currentTarget.style.background = "none"}>📷 Resetar e Escanear QR</button>}
                      {c.tipo === "waba" && <button onClick={() => registrarNumeroWaba(c)} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#16a34a", fontSize: 13, cursor: "pointer", textAlign: "left", fontWeight: 700, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"} onMouseLeave={e => e.currentTarget.style.background = "none"}>🟢 Ativar Número na Meta</button>}
                      <button onClick={() => encerrarAtendimentosEmMassa("aguardando", c)} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#f59e0b", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#fffbeb"} onMouseLeave={e => e.currentTarget.style.background = "none"}>⏳ Encerrar Aguardando</button>
                      <button onClick={() => encerrarAtendimentosEmMassa("abertos", c)} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#2563eb", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"} onMouseLeave={e => e.currentTarget.style.background = "none"}>💬 Encerrar Abertos</button>
                      <div style={{ height: 1, background: "#e5e7eb", margin: "4px 0" }} />
                      <button onClick={() => excluirCanal(c.id)} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#dc2626", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "#fef2f2"} onMouseLeave={e => e.currentTarget.style.background = "none"}>🗑️ Excluir Canal</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL SELEÇÃO DE PAGES */}
      {showSelecaoPages && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...cardStyle, width: "100%", maxWidth: 600, display: "flex", flexDirection: "column", maxHeight: "85vh", overflow: "hidden" }}>
            <div style={{ padding: "20px 28px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: 0 }}>📲 Escolha as fan pages</h2>
              <p style={{ color: "#6b7280", fontSize: 12, margin: "4px 0 0" }}>Marque quais Facebook pages você quer conectar. Cada page com Instagram Business vai gerar 2 canais (Messenger + Instagram).</p>
            </div>
            <div style={{ overflowY: "auto", padding: "16px 28px", flex: 1 }}>
              {pagesDisponiveis.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: 20 }}>Nenhuma page encontrada</p>
              ) : pagesDisponiveis.map((p: any) => {
                const selecionada = pagesSelecionadas.has(p.id);
                return (
                  <button key={p.id} onClick={() => togglePage(p.id)}
                    style={{
                      display: "flex", width: "100%", alignItems: "center", gap: 12,
                      background: selecionada ? "#f0fdf4" : "#f9fafb",
                      border: `2px solid ${selecionada ? "#16a34a" : "#e5e7eb"}`,
                      borderRadius: 12, padding: "12px 14px", marginBottom: 10,
                      cursor: "pointer", textAlign: "left",
                    }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: selecionada ? "#16a34a" : "transparent", border: `2px solid ${selecionada ? "#16a34a" : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {selecionada && <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                      <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0" }}>
                        💬 Messenger
                        {p.instagram_username && <span> · 📷 @{p.instagram_username}</span>}
                        {!p.instagram_username && <span style={{ color: "#9ca3af" }}> · sem Instagram</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "16px 28px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>{pagesSelecionadas.size} de {pagesDisponiveis.length} selecionada(s)</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowSelecaoPages(false); setPagesSelecionadas(new Set()); }} disabled={conectandoMeta} style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: conectandoMeta ? "not-allowed" : "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={confirmarSelecaoPages} disabled={conectandoMeta || pagesSelecionadas.size === 0} style={{ background: conectandoMeta ? "#1d4ed8" : "#1877f2", color: "white", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: (conectandoMeta || pagesSelecionadas.size === 0) ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(24,119,242,0.3)" }}>{conectandoMeta ? "⏳ Conectando..." : `📲 Conectar (${pagesSelecionadas.size})`}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}