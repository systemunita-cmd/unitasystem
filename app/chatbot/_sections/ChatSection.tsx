"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissao } from "../../hooks/usePermissao";
import { useTemPermissao } from "../../hooks/useTemPermissao";
import { useSoftphone } from "../../hooks/useSoftphone";
import { useEquipeFiltro } from "../../hooks/useEquipeFiltro";
import { montarCamposUnificados, type ConfigCampoPadrao, type CampoCustom } from "../../lib/campos_proposta_definicao";

// URL do backend UnitaZAP (configure no .env.local)
const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";

type Atendimento = {
  id: number; created_at: string; updated_at?: string; numero: string; nome: string; mensagem: string;
  status: string; fila: string; atendente: string;
  canal_id?: number;
  equipe_id?: number | null; // 🆕 equipe dona do atendimento (filtro de Equipes)
  // 🆕 origem da conversa (canal Meta): 'instagram' | 'messenger' | null
  origem?: string | null;
  email?: string; notas?: string; avaliacao?: number;
  bloqueado_ia?: boolean; bloqueado_fluxo?: boolean; bloqueado_typebot?: boolean; bloqueado_contato?: boolean;
  // 🆕 BLOQUEIO PÓS-FINALIZAÇÃO 24h
  bloqueado_ate?: string | null; // timestamp ISO até quando o cliente fica bloqueado de reabrir
  atendente_finalizou?: string | null; // email do atendente que finalizou (pra reabrir no mesmo)
  funil_etapa?: string; kanban_coluna?: string; demanda?: string; valor?: number;
  // 🔔 NOTIFICAÇÕES: timestamp de quando o atendente clicou no chat pela última vez.
  // NULL = nunca foi visualizado nessa lógica nova. Ao clicar no chat, vira NOW().
  // Usado pra contar mensagens "não lidas" (mensagens do cliente com created_at > visualizado_em).
  visualizado_em?: string | null;
};
type Mensagem = { id?: number; created_at?: string; numero: string; mensagem: string; de: string; canal_id?: number; origem?: string; };
type Etiqueta = { id: number; nome: string; cor: string; icone: string; };
type UsuarioWs = { email: string; nome: string; fila?: string | null; };
type CanalInfo = { id: number; nome: string; tipo: string;   modulos?: string[] | null;
};

/// 🆕 Papel de parede estilo WhatsApp Light — fundo bege com símbolos sutis (balões, corações, estrela, envelope, relógio, check, presente, câmera, folha)
const WA_BG_LIGHT = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><g fill='%23000000' fill-opacity='0.05'><path d='M20 30 q0 -10 10 -10 h40 q10 0 10 10 v15 q0 10 -10 10 h-25 l-10 10 v-10 h-5 q-10 0 -10 -10 z'/><path d='M120 32 q-8 -10 -16 0 q-8 10 8 22 q16 -12 8 -22 z'/><path d='M195 25 l3 8 l9 0 l-7 5 l3 9 l-8 -5 l-8 5 l3 -9 l-7 -5 l9 0 z'/><rect x='100' y='90' width='40' height='25' rx='3' fill='none' stroke='%23000000' stroke-opacity='0.05' stroke-width='2'/><path d='M100 95 l20 14 l20 -14' stroke='%23000000' stroke-opacity='0.05' stroke-width='2' fill='none'/><circle cx='195' cy='105' r='12' fill='none' stroke='%23000000' stroke-opacity='0.05' stroke-width='2'/><path d='M195 97 v8 l5 4' stroke='%23000000' stroke-opacity='0.05' stroke-width='2' fill='none' stroke-linecap='round'/><path d='M35 95 l8 8 l16 -16' stroke='%23000000' stroke-opacity='0.05' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/><rect x='20' y='160' width='30' height='30' rx='2'/><rect x='90' y='155' width='35' height='25' rx='3' fill='none' stroke='%23000000' stroke-opacity='0.05' stroke-width='2'/><circle cx='107' cy='167' r='6' fill='none' stroke='%23000000' stroke-opacity='0.05' stroke-width='2'/><path d='M170 165 q-5 10 5 20 q10 -5 15 -15 q-5 -10 -20 -5 z'/><circle cx='60' cy='200' r='6'/></g></svg>")`;

const WA_BG_DARK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200' opacity='0.04'><g fill='%23ffffff'><path d='M40 40 l10 0 l0 10 l-10 0 z'/><circle cx='70' cy='75' r='4'/><path d='M110 35 l15 -5 l5 15 l-15 5 z' opacity='0.6'/><circle cx='150' cy='55' r='3'/><path d='M30 110 l8 8 l-8 8 l-8 -8 z'/><circle cx='80' cy='135' r='5'/><path d='M130 115 l10 0 l-5 10 z' opacity='0.7'/><circle cx='165' cy='150' r='4'/><path d='M50 170 l12 0 l-6 12 z'/><circle cx='100' cy='180' r='3'/></g></svg>")`;

// 🆕 Lista de emojis organizados por categoria (estilo WhatsApp/Telegram)
// Seleção curada dos mais usados — sem depender de lib externa
const EMOJIS_CATEGORIAS: { id: string; label: string; icone: string; emojis: string[] }[] = [
  {
    id: "smileys", label: "Smileys", icone: "😊", emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨",
      "😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕",
      "🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁",
      "☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣",
      "😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺"
    ]
  },
  {
    id: "gestos", label: "Gestos & Pessoas", icone: "👋", emojis: [
      "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆",
      "🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️",
      "💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🦷","🦴","👀","👁️","👅","👄",
      "👶","🧒","👦","👧","🧑","👨","👩","🧔","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷"
    ]
  },
  {
    id: "animais", label: "Animais & Natureza", icone: "🐶", emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵",
      "🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗",
      "🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖",
      "🐙","🦑","🦐","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍",
      "🌵","🎄","🌲","🌳","🌴","🌱","🌿","☘️","🍀","🎍","🎋","🍃","🍂","🍁","🍄","🌾",
      "💐","🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗",
      "🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","💫","⭐","🌟","✨","⚡","☄️","💥","🔥"
    ]
  },
  {
    id: "comida", label: "Comida & Bebida", icone: "🍔", emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥",
      "🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠",
      "🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🦴",
      "🌭","🍔","🍟","🍕","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜",
      "🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧",
      "🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯",
      "🥛","🍼","☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊","🥄","🍴"
    ]
  },
  {
    id: "atividades", label: "Atividades & Esportes", icone: "⚽", emojis: [
      "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍",
      "🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌",
      "🎿","⛷️","🏂","🪂","🏋️","🤼","🤸","⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🤽",
      "🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹",
      "🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🪕","🎻","🎲","♟️","🎯",
      "🎳","🎮","🎰","🧩","🎨"
    ]
  },
  {
    id: "viagens", label: "Viagens & Lugares", icone: "🚗", emojis: [
      "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍️","🛵",
      "🚲","🛴","🛺","🚠","🚡","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇",
      "🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️",
      "⛴️","🚢","⚓","⛽","🚧","🚦","🚥","🗺️","🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢",
      "🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🏠","🏡","🏘️","🏚️",
      "🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","⛪","🕌","🕍","🛕","🕋"
    ]
  },
  {
    id: "objetos", label: "Objetos", icone: "💡", emojis: [
      "⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼",
      "📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭",
      "⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯️","🪔","🧯","🛢️","💸",
      "💵","💴","💶","💷","💰","💳","💎","⚖️","🧰","🔧","🔨","⚒️","🛠️","⛏️","🔩","⚙️",
      "🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","⚱️","🏺","🔮",
      "📿","🧿","💈","⚗️","🔭","🔬","🕳️","🩹","🩺","💊","💉","🩸","🧬","🦠","🧫","🧪",
      "🌡️","🧹","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🧼","🪒","🧽","🧴","🔑","🗝️","🚪",
      "🛋️","🛏️","🛌","🧸","🖼️","🛍️","🛒","🎁","🎈","🎏","🎀","🎊","🎉","🎎","🏮","🎐"
    ]
  },
  {
    id: "simbolos", label: "Símbolos & Corações", icone: "❤️", emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈",
      "♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴",
      "📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲",
      "🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷",
      "🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️",
      "🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤",
      "🏧","🚾","♿","🅿️","🈳","🈂️","🛂","🛃","🛄","🛅","🚹","🚺","🚼","🚻","🚮","🎦"
    ]
  }
];

// ═══ Player de áudio estilo WhatsApp (com waveform real) ═══
function AudioPlayer({ src, isOwn }: { src: string; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(40).fill(0.3));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const resp = await fetch(src);
        const buf = await resp.arrayBuffer();
        // @ts-ignore
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(buf);
        const raw = audioBuffer.getChannelData(0);
        const samples = 40;
        const blockSize = Math.floor(raw.length / samples);
        const peaks: number[] = [];
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[i * blockSize + j] || 0);
          peaks.push(sum / blockSize);
        }
        const max = Math.max(...peaks, 0.01);
        const normalized = peaks.map(p => Math.max(0.15, p / max));
        if (!cancel) setWaveform(normalized);
        try { ctx.close(); } catch {}
      } catch (err) { console.warn("Falha ao gerar waveform:", err); }
    })();
    return () => { cancel = true; };
  }, [src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => { setDuration(a.duration || 0); setLoaded(true); };
    const onTime = () => setCurrent(a.currentTime || 0);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };

  const seekFromBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, pct * duration));
    a.currentTime = newTime; setCurrent(newTime);
  };

  const format = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const corAtiva = isOwn ? "#ffffff" : "#00a884";
  const corInativa = isOwn ? "#0d7a5f" : "#5d7a80";
  const progress = duration ? current / duration : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 260, padding: "4px 2px" }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: "none" }} />
      <button onClick={toggle}
        style={{ width: 36, height: 36, borderRadius: "50%", background: isOwn ? "#ffffff22" : "#00a88422", border: "none", color: isOwn ? "#ffffff" : "#00a884", fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        {playing ? "⏸" : "▶"}
      </button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div onClick={seekFromBar}
          style={{ display: "flex", alignItems: "center", gap: 2, height: 28, cursor: "pointer", userSelect: "none" }}>
          {waveform.map((h, i) => {
            const isPast = (i / waveform.length) < progress;
            return (
              <div key={i} style={{ flex: 1, height: `${Math.max(15, h * 100)}%`, minHeight: 4, background: isPast ? corAtiva : corInativa, borderRadius: 2, transition: "background 0.1s" }} />
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: isOwn ? "#a3e4d0" : "#8696a0", fontVariantNumeric: "tabular-nums" }}>
          {loaded ? format(playing || current > 0 ? current : duration) : "carregando…"}
        </span>
      </div>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: isOwn ? "#ffffff22" : "#8696a033", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
        {isOwn ? "👤" : "🧑"}
      </div>
    </div>
  );
}

export function ChatSection({ modoCobranca = false, moduloFiltro = null }: { modoCobranca?: boolean; moduloFiltro?: string | null } = {}) {
  // useWorkspace removido (single-tenant Unita)
  // Substituído por auth direto do Supabase pra preservar `user.email` em fluxos
  const workspace = null as any;
  const wsId: string | null = null;
  const [user, setUser] = useState<{ email: string; id?: string; nome?: string } | null>(null);
  // 📡 Canais que o usuário pode ver (soma usuário + grupo). null = ainda carregando.
  const [canaisPermitidos, setCanaisPermitidos] = useState<Set<number> | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      // busca nome na tabela usuarios
      let nome = data.user.email?.split("@")[0] || "";
      let canaisUser: number[] = [];
      let grupoId: number | null = null;
      try {
        const { data: u } = await supabase.from("usuarios").select("nome, canais_acesso, grupo_id").eq("auth_user_id", data.user.id).maybeSingle();
        if (u?.nome) nome = u.nome;
        if (Array.isArray(u?.canais_acesso)) canaisUser = u!.canais_acesso as number[];
        grupoId = (u as any)?.grupo_id ?? null;
      } catch {}
      // 📡 Soma os canais do grupo (canais_acesso do grupo) com os do usuário.
      let canaisGrupo: number[] = [];
      if (grupoId) {
        try {
          const { data: g } = await supabase.from("grupos_permissao").select("canais_acesso").eq("id", grupoId).maybeSingle();
          if (Array.isArray(g?.canais_acesso)) canaisGrupo = g!.canais_acesso as number[];
        } catch {}
      }
      if (alive) setCanaisPermitidos(new Set([...canaisUser, ...canaisGrupo].map(Number)));
      setUser({ email: data.user.email || "", id: data.user.id, nome });
    })();
    return () => { alive = false; };
  }, []);
  const { permissoes, isDono } = usePermissao();
  // 🛡️ Sistema novo de permissões (combinado com antigo via OR)
  const perm = useTemPermissao();
  const novoEscopoAtend     = perm.escopo("atendimentos.acessar");
  const novoPodeAtender     = perm.tem("atendimentos.atender_chats");
  const novoPodeTransferir  = perm.tem("atendimentos.transferir");
  const novoPodeFinalizar   = perm.tem("atendimentos.finalizar_outros");
  const novoPodeAudio       = perm.tem("atendimentos.enviar_audio");
  const novoPodeMidia       = perm.tem("atendimentos.enviar_midia");
  const novoPodeBloquear    = perm.tem("atendimentos.bloquear_cliente");
  const novoPodeHistorico   = perm.tem("atendimentos.ver_historico");
  const podeAcessarChats    = perm.superAdmin || isDono || novoEscopoAtend !== "none" || !!permissoes.chat_proprio || !!permissoes.chat_todos;
  // 🆕 Softphone — botão de ligar chama iniciarChamada(numero, nome)
  const { iniciarChamada } = useSoftphone();
  // 👥 Filtro de equipe (mesmo padrão de Vendas / Contatos / Dashboard)
  const { equipeId, EquipeSelector } = useEquipeFiltro(wsId || "");
  // 🎯 Etapas do funil configuradas no workspace (mesma fonte do Funil de Vendas — multi-vertical).
  // Cada item: { opcao, tipo } onde tipo = 'ganho' | 'perdido' | 'pipeline'. Vazio = usa fallback fixo.
  const [funilEtapas, setFunilEtapas] = useState<{ opcao: string; tipo: "ganho" | "perdido" | "pipeline" }[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  // 🆕 Ref do container de mensagens — usado pra ler scrollTop e saber se o user tá no fundo
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 🆕 "Sticky fundo": se o usuário está colado ao final (ou não). Só mexe scroll automaticamente se true.
  // Evita o bug de forçar o scroll pra baixo quando o user tá lendo msg antiga lá em cima.
  const [stickyFundo, setStickyFundo] = useState(true);
  // 🆕 Indica se chegou mensagem nova enquanto o user estava scrollado pra cima (pra mostrar badge flutuante)
  const [temMensagemNova, setTemMensagemNova] = useState(false);

  // 🆕 Indica se a Roleta de Distribuição está ativa no workspace.
  // Quando ativa, o atendente vê o botão "Parar BOT/IA" nos chats onde a roleta já atribuiu ele,
  // mesmo com o bot ainda respondendo. Clicando, ele assume e o bot para.
  const [roletaAtiva, setRoletaAtiva] = useState(false);

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // FASE 1 MOBILE — detecta tela < 768px pra alternar layout split (desktop)
  // pra fullscreen (mobile, estilo WhatsApp: lista → clica → chat fullscreen)
  // ═══════════════════════════════════════════════════════════════════════
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🔔 ═══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE NOTIFICAÇÕES (estilo WhatsApp)
  // ═══════════════════════════════════════════════════════════════════════════
  // Som ligado/desligado — atendente decide. Salvo em localStorage por usuário.
  // Default: ligado (teleatendimento precisa ouvir).
  const [somAtivo, setSomAtivo] = useState<boolean>(true);
  // Map<atendimento_id, qtd_nao_lidas> — quantas msgs do cliente vieram após visualizado_em
  const [naoLidasPorAtendimento, setNaoLidasPorAtendimento] = useState<Record<number, number>>({});
  // Set de IDs já conhecidos — usado pra detectar "atendimento NOVO" (toca som diferente)
  // Refs em vez de state pra não disparar re-render — só queremos saber se já vimos antes.
  const atendimentosConhecidosRef = useRef<Set<number>>(new Set());
  // Flag pra ignorar a primeira carga (evita tocar som pra todos os atendimentos antigos no F5)
  const primeiraCargaAtendimentosRef = useRef<boolean>(true);
  // Ref do AudioContext — criado uma vez e reusado (browser limita instâncias)
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Ref pra última quantidade conhecida de não lidas por atendimento — pra detectar quando aumentou
  const ultimaQtdNaoLidasRef = useRef<Record<number, number>>({});

  const [mensagem, setMensagem] = useState("");
  // 🆕 Ref pro textarea de mensagem — usado pra resetar altura após envio
  const mensagemTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [mensagemInterna, setMensagemInterna] = useState("");
  const [showRespostas, setShowRespostas] = useState(false);
  const [showTransferir, setShowTransferir] = useState(false);
  const [showChatInterno, setShowChatInterno] = useState(false);
  const [showFiltros, setShowFiltros] = useState(false);
  // 🆕 FASE 1.6 — menu ⋮ que aparece no mobile, agrupa botões secundários do header do chat
  // (Ver dados, Atualizar, Encaminhar, Finalizar Venda, Finalizar) — desktop continua mostrando tudo na toolbar
  const [showMenuMobileChat, setShowMenuMobileChat] = useState(false);

  // 🆕 Emoji picker — abre painel fixo acima do input, estilo WhatsApp
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategoria, setEmojiCategoria] = useState<string>("smileys");
  const [emojiBusca, setEmojiBusca] = useState("");

  // 🆕 Upload de mídia (imagem/vídeo/PDF/Excel/doc)
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [arquivoPreviewUrl, setArquivoPreviewUrl] = useState<string>("");
  const [legendaArquivo, setLegendaArquivo] = useState("");
  const [enviandoMidia, setEnviandoMidia] = useState(false);

  // 🆕 Template WABA — envia template pra cliente (rompe janela 24h de WABA)
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templatesDoCanal, setTemplatesDoCanal] = useState<any[]>([]);
  const [templateEscolhido, setTemplateEscolhido] = useState<any | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [enviandoTemplate, setEnviandoTemplate] = useState(false);
  // 🆕 Menu de 3 pontinhos REMOVIDO — todos os botões ficam visíveis na toolbar agora
  const [abaConversa, setAbaConversa] = useState<"automatico" | "aguardando" | "abertos" | "finalizados">("aguardando");
  const [busca, setBusca] = useState("");
  // 🆕 BUSCA EM MENSAGENS — quando user digita 3+ chars, dispara query nas mensagens.
  //    atendimentosComMatch contém IDs de atendimentos que têm a mensagem buscada.
  //    Usado pra filtrar a lista junto com nome/número.
  //    null = ainda não buscou (busca curta ou vazia)
  //    Set vazio = buscou e não encontrou nada
  const [atendimentosComMatch, setAtendimentosComMatch] = useState<Set<string> | null>(null);
  const [buscandoMsgs, setBuscandoMsgs] = useState(false);
  // Cache simples — se repetir a mesma busca, reusa o resultado
  const cacheBuscaRef = useRef<Map<string, Set<string>>>(new Map());
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [atendimentoAtivo, setAtendimentoAtivo] = useState<Atendimento | null>(null);
  const [historico, setHistorico] = useState<Mensagem[]>([]);
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const [canais, setCanais] = useState<CanalInfo[]>([]);

  // ══════════ 💰 MODO COBRANÇA ══════════
  // Atendimento "da cobrança" = fila com COBRAN* OU conexão cujo nome tenha COBRAN*.
  const normCob = (x: any) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const ehAtendimentoCobranca = (a: Atendimento): boolean => {
    if (normCob(a.fila).includes("COBRAN")) return true;
    const c = canais.find(cx => String(cx.id) === String((a as any).canal_id));
    return !!c && normCob((c as any).nome).includes("COBRAN");
  };
  // Painel com os dados do cliente (proposta + faturas) casado pelo telefone
  const [clienteCob, setClienteCob] = useState<any | null>(null);
  const [faturasCob, setFaturasCob] = useState<any[]>([]);
  const [painelCobAberto, setPainelCobAberto] = useState(true);
  useEffect(() => {
    if (!modoCobranca || !atendimentoAtivo?.numero) { setClienteCob(null); setFaturasCob([]); return; }
    let alive = true;
    (async () => {
      try {
        const dig = String(atendimentoAtivo.numero).replace(/\D/g, "");
        const suf4 = dig.slice(-4);
        if (suf4.length < 4) { if (alive) { setClienteCob(null); setFaturasCob([]); } return; }
        // pré-filtra no banco pelos 4 últimos dígitos (telefone gravado com máscara
        // termina em dígitos) e confirma no cliente comparando só os números
        const { data } = await supabase.from("proposta")
          .select("id, nome, cpf, plano, valor_plano, vencimento, status_venda, data_instalacao, telefone1, telefone2, telefone3, dados_customizados, created_at")
          .or(`telefone1.ilike.%${suf4},telefone2.ilike.%${suf4},telefone3.ilike.%${suf4}`)
          .order("created_at", { ascending: false })
          .limit(25);
        const alvo = dig.slice(-8);
        const cli = (data || []).find((pp: any) => [pp.telefone1, pp.telefone2, pp.telefone3].some((t: any) => {
          const td = String(t || "").replace(/\D/g, "");
          return td.length >= 8 && (td.endsWith(alvo) || alvo.endsWith(td.slice(-8)));
        })) || null;
        if (!alive) return;
        setClienteCob(cli);
        if (cli) {
          const { data: fs } = await supabase.from("faturas_status").select("*")
            .eq("proposta_id", cli.id)
            .order("numero_referencia", { ascending: false })
            .limit(24);
          if (alive) setFaturasCob(fs || []);
        } else {
          setFaturasCob([]);
        }
      } catch { if (alive) { setClienteCob(null); setFaturasCob([]); } }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoCobranca, atendimentoAtivo?.id]);
  const [filtroCanal, setFiltroCanal] = useState<string>("todos");

  const [mostrarTodosFinalizados, setMostrarTodosFinalizados] = useState(false);

  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const [usuariosWs, setUsuariosWs] = useState<UsuarioWs[]>([]);
  // 🆕 Filas CADASTRADAS no sistema (tabela `filas`) — não só as derivadas de atendimentos
  const [filasBanco, setFilasBanco] = useState<string[]>([]);
  const [meuNome, setMeuNome] = useState("");

  const [showPainelContato, setShowPainelContato] = useState(false);
  const [abaPainel, setAbaPainel] = useState<"perfil" | "protocolo" | "funil" | "ia" | "utils" | "etiquetas">("perfil");
  const [salvandoContato, setSalvandoContato] = useState(false);

  const [etiquetasWorkspace, setEtiquetasWorkspace] = useState<Etiqueta[]>([]);
  // 🆕 Mapa de etiquetas por atendimento — usado pra mostrar tags coloridas na lista
  // Formato: { [atendimentoId]: [etiquetaId1, etiquetaId2, ...] }
  // Carregado uma vez quando o workspace carrega + recarregado quando muda alguma coisa
  const [etiquetasPorAtendimento, setEtiquetasPorAtendimento] = useState<Record<number, number[]>>({});
  const [etiquetasAtendimento, setEtiquetasAtendimento] = useState<number[]>([]);

  const [filtroFila, setFiltroFila] = useState("todas");
  const [filtroAtendente, setFiltroAtendente] = useState("todos");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState("todas");

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // ENCERRAR ATENDIMENTOS ANTIGOS — limpa pendentes que ninguém respondeu há X dias
  // ═══════════════════════════════════════════════════════════════════════
  // Por que existe: a aba "Aguardando" acumula leads que ninguém respondeu.
  // Em workspaces com muitos leads/dia (50-200), em uma semana já tem milhar
  // de atendimentos pendentes que nunca vão ser respondidos (o cliente desistiu,
  // era spam, era duplicado, etc). Sem limpeza, a lista cresce indefinidamente.
  //
  // O botão dispara um modal onde o user escolhe a antiguidade (1/2/3/7 dias)
  // e confirma. Faz UPDATE em massa: status=resolvido + insere mensagem do sistema
  // explicando que foi encerrado por inatividade.
  const [showEncerrarAntigos, setShowEncerrarAntigos] = useState(false);
  const [diasAntiguidade, setDiasAntiguidade] = useState<1 | 2 | 3 | 7>(2);
  const [encerrandoAntigos, setEncerrandoAntigos] = useState(false);

  // 🆕 Contagens reais vindas DO BANCO (não do array em memória).
  // Por que: o array de atendimentos tem limite de 1000 do Supabase. Em workspaces
  // com muito acúmulo (ex: 5000+ pendentes), o array só vê os 1000 mais recentes —
  // e a função "contar antigos" filtrando esse array daria 0 mesmo tendo milhares
  // antigos no banco. Esse state guarda a contagem REAL por antiguidade.
  const [pendentesAntigosCount, setPendentesAntigosCount] = useState<{ [dias: number]: number }>({ 1: 0, 2: 0, 3: 0, 7: 0 });

  // 🎨 PALETA TECH LIGHT FIXA — alinhada com editor de fluxos e chatbot
  // Não tem mais toggle dark/light — Robert pediu visual sempre claro estilo BotConversa.
  // Mantemos `tema` como objeto pra não quebrar todas as referências espalhadas no JSX.
  const ehClaro = true; // mantido pra compat com if's existentes
  const tema = {
    sidebarBg:    "#ffffff",
    headerBg:     "#ffffff",
    listaItem:    "#ffffff",
    listaItemSel: "#f3f4f6",
    chatBg:       "#efeae2",
    inputBg:      "#ffffff",
    inputBgAlt:   "#f9fafb",
    bordaSutil:   "#e5e7eb",
    bordaForte:   "#d1d5db",
    textoForte:   "#1f2937",
    textoNormal:  "#4b5563",
    textoFraco:   "#9ca3af",
    bolha:        "#ffffff",
    bolhaMinha:   "#dbeafe",   // 🔵 atendente/bot = azul claro
    bolhaSistema: "#fef3c7",
    accent:       "#2563eb",   // azul tech (era verde WhatsApp)
    accentHover:  "#2563eb"};

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // FILTRO DE TEMPO — "tudo" / "sem_resposta" / "ultima_hora" / "ultimos_15min"
  // ═══════════════════════════════════════════════════════════════════════
  // - "tudo"            → comportamento atual (não filtra por tempo)
  // - "sem_resposta"    → atendimentos onde a ÚLTIMA mensagem foi do cliente (de='cliente')
  //                       e ainda não houve resposta humana/bot. Critério prático: usa
  //                       `visualizado_em` como proxy — se for null E status pendente, é não respondido.
  //                       Para precisão real, faz query adicional (deixei query async).
  // - "ultima_hora"     → atendimentos com updated_at ≥ now-1h
  // - "ultimos_15min"   → atendimentos com updated_at ≥ now-15min
  const [filtroTempo, setFiltroTempo] = useState<"tudo" | "sem_resposta" | "ultima_hora" | "ultimos_15min">("tudo");

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // BOTÃO ATUALIZAR — feedback visual de carregamento
  // ═══════════════════════════════════════════════════════════════════════
  // Antes só chamava fetchAtendimentos sem feedback, dava sensação que não funcionava.
  // Agora: estado `atualizando` controla animação de spin do emoji 🔄, e a função
  // `atualizarManual` recarrega TUDO: lista de atendimentos + histórico do chat ativo +
  // canais e usuários (caso tenham mudado).
  const [atualizando, setAtualizando] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // 💬 RESPONDER / EDITAR MENSAGEM
  // ═══════════════════════════════════════════════════════════════════════
  // respondendoMsg: msg que está sendo respondida. Quando setada, banner aparece
  //                 acima do input. Ao enviar, concatena quote visual antes do texto.
  // editandoMsg:    msg que está sendo editada. Atualiza o histórico interno do Wolf
  //                 (cliente já recebeu a original — APIs do WhatsApp/Meta têm limitação
  //                 forte pra edit; aqui é só pra correção visual no histórico interno).
  // hoverMsgIdx:    índice da msg sob hover — controla aparição do botão ⋮.
  // menuMsgIdx:     índice da msg com menu aberto.
  type MensagemHist = typeof historico extends Array<infer T> ? T : never;
  const [respondendoMsg, setRespondendoMsg] = useState<any | null>(null);
  const [editandoMsg, setEditandoMsg] = useState<any | null>(null);
  const [hoverMsgIdx, setHoverMsgIdx] = useState<number | null>(null);
  const [menuMsgIdx, setMenuMsgIdx] = useState<number | null>(null);

  const marcarParaResponder = (msg: any) => {
    setRespondendoMsg(msg);
    setEditandoMsg(null);
    setMenuMsgIdx(null);
  };

  const marcarParaEditar = (msg: any) => {
    setEditandoMsg(msg);
    setRespondendoMsg(null);
    // Tira o cabeçalho "*Nome*\n" do início (se tiver) pra editar só o conteúdo real
    const textoSemCabecalho = String(msg.mensagem || "").replace(/^\*[^*]+\*\n/, "");
    // Tira marcador "*(editado)*" se já tiver (evita ficar concatenando)
    const textoLimpo = textoSemCabecalho.replace(/\s*\*\(editado\)\*\s*$/, "");
    setMensagem(textoLimpo);
    setMenuMsgIdx(null);
  };

  const cancelarRespostaOuEdicao = () => {
    if (editandoMsg) setMensagem("");
    setRespondendoMsg(null);
    setEditandoMsg(null);
  };

  // Helper: pode editar? (só msgs próprias do atendente, enviadas há < 15min)
  const podeEditarMsg = (msg: any): boolean => {
    if (!msg || msg.de === "cliente" || msg.de === "bot" || msg.de === "sistema") return false;
    if (!msg.id) return false;
    if (!msg.created_at) return true; // sem timestamp, assume recente
    const idade = Date.now() - new Date(msg.created_at).getTime();
    return idade < 15 * 60 * 1000; // 15 minutos
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Substitui os alert() nativos do browser (que mostram "app.wolfgyn.com.br diz...")
  // por toasts bonitos no canto da tela. Mais profissional pro cliente final ver.
  type ToastTipo = "sucesso" | "erro" | "aviso" | "info";
  type Toast = { id: number; msg: string; tipo: ToastTipo; subMsg?: string };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const notify = (msg: string, tipo: ToastTipo = "info", subMsg?: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, tipo, subMsg }]);
    // Toast some sozinho depois de X segundos (erros ficam mais tempo)
    const duracao = tipo === "erro" ? 6000 : tipo === "aviso" ? 5000 : 3500;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duracao);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 🌐 TRADUTOR DE ERROS TÉCNICOS → MENSAGEM AMIGÁVEL EM PT-BR
  // ═══════════════════════════════════════════════════════════════════════
  // Recebe a string crua do erro (axios, fetch, supabase, Meta API) e devolve
  // algo que cliente entenda. Se não casar com nenhum padrão, devolve a string
  // original (mas sanitizada — sem stack trace nem JSON).
  const traduzirErro = (err: any): string => {
    if (!err) return "Erro desconhecido. Tente novamente.";
    let msg = typeof err === "string" ? err : (err.message || err.error || JSON.stringify(err));
    msg = String(msg).toLowerCase();

    // WhatsApp WebJS / Chromium zumbi
    if (msg.includes("canal webjs desconectado") || msg.includes("client not ready")) {
      return "WhatsApp desconectado — reconecte o canal em Conexões.";
    }
    if (msg.includes("detached frame") || msg.includes("session closed") || msg.includes("target closed")) {
      return "WhatsApp travou momentaneamente. Tente novamente em ~20 segundos.";
    }
    if (msg.includes("protocoltimeout") || msg.includes("execution context was destroyed")) {
      return "WhatsApp lento agora. Tente novamente em alguns instantes.";
    }

    // Meta API (Facebook/Instagram/WABA) — códigos comuns
    if (msg.includes("(#100)") || msg.includes("formato não aceito") || msg.includes("attachment")) {
      return "Formato de arquivo não aceito pela Meta. Use PDF, imagem, vídeo ou áudio.";
    }
    if (msg.includes("(#190)") || msg.includes("oauthexception") || msg.includes("access token")) {
      return "Token do Facebook expirou. Reconecte o canal em Conexões.";
    }
    if (msg.includes("(#10)") || msg.includes("permission")) {
      return "Permissão negada pela Meta. Verifique as configurações do canal.";
    }
    if (msg.includes("(#131047)") || msg.includes("re-engagement") || msg.includes("24 hour")) {
      return "Janela de 24h expirou. Envie um template aprovado.";
    }
    if (msg.includes("(#131056)") || msg.includes("blocked")) {
      return "Cliente bloqueou mensagens neste número.";
    }
    if (msg.includes("(#131051)") || msg.includes("message type")) {
      return "Tipo de mensagem não suportado pelo canal.";
    }

    // HTTP genérico
    if (msg.includes("vps 500") || msg.includes("internal server error") || msg.includes("status 500")) {
      return "Erro no servidor. Tente novamente em alguns instantes.";
    }
    if (msg.includes("503") || msg.includes("service unavailable")) {
      return "Servidor temporariamente indisponível. Tente novamente.";
    }
    if (msg.includes("504") || msg.includes("gateway timeout") || msg.includes("timeout")) {
      return "Servidor demorou pra responder. Tente novamente.";
    }
    if (msg.includes("401") || msg.includes("unauthorized")) {
      return "Sessão expirada. Faça login novamente.";
    }
    if (msg.includes("403") || msg.includes("forbidden")) {
      return "Você não tem permissão para esta ação.";
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return "Recurso não encontrado.";
    }
    if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("err_internet")) {
      return "Falha de conexão. Verifique sua internet.";
    }

    // Permissões do navegador
    if (msg.includes("microfone") || msg.includes("microphone") || msg.includes("permission denied")) {
      return "Não foi possível acessar o microfone. Verifique as permissões do navegador.";
    }
    if (msg.includes("popup") || msg.includes("blocked")) {
      return "Pop-up bloqueado pelo navegador. Permita pop-ups deste site.";
    }

    // Default: devolve a mensagem original limpa (sem JSON, sem stack)
    const original = typeof err === "string" ? err : (err.message || err.error || "Erro desconhecido");
    // Tira JSON cru, status codes, prefixos técnicos
    return String(original)
      .replace(/VPS \d+: /, "")
      .replace(/^.*"error":"([^"]+)".*$/, "$1")
      .replace(/^\{.*\}$/, "Erro desconhecido. Tente novamente.")
      .slice(0, 200);
  };

  const IS = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const };
  const inputSm = { ...IS, padding: "7px 10px", fontSize: 12 };

  // 🆕 ═══════════════════════════════════════════════════════════════════
  // RESPOSTAS RÁPIDAS — buscadas do banco (tabela respostas_rapidas)
  // ═══════════════════════════════════════════════════════════════════════
  // Antes era array hardcoded com 4 fixos (/oi, /planos, /aguarda, /encerrar).
  // Bug: usuário cadastrava em Configurações → Respostas Rápidas mas o popup
  // do chat NUNCA mostrava — ficava só nos 4 fixos do código.
  // Agora: useState + fetch do banco filtrando por workspace_id.
  // Fallback: se vier vazio do banco, mostra os 4 padrão (UX).
  const respostasRapidasFallback = [
    { atalho: "/oi", mensagem: "Olá! Seja bem-vindo(a)! Como posso te ajudar hoje?" },
    { atalho: "/planos", mensagem: "Temos planos a partir de R$ 89,90. Posso te passar mais detalhes!" },
    { atalho: "/aguarda", mensagem: "Por favor, aguarde um momento que já vou te atender!" },
    { atalho: "/encerrar", mensagem: "Obrigado pelo contato! Tenha um ótimo dia!" },
  ];
  const [respostasRapidasDB, setRespostasRapidasDB] = useState<{ atalho: string; mensagem: string }[]>([]);
  const respostasRapidas = respostasRapidasDB.length > 0 ? respostasRapidasDB : respostasRapidasFallback;

  // 🔒 Mesma fórmula de chave usada no RespostasRapidasSection — multi-tenant consistente
  useEffect(() => {
    const wsKey = "unita";  // single-tenant
    if (!wsKey) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("respostas_rapidas")
          .select("atalho, mensagem")
          
          .order("created_at", { ascending: true });
        if (!error && data) setRespostasRapidasDB(data);
      } catch (e) {
        console.warn("[ChatSection] erro ao buscar respostas_rapidas:", e);
      }
    })();
  }, [workspace, wsId]);

  // 🎯 ═══════════════════════════════════════════════════════════════════════
  // ETAPAS DO FUNIL CONFIGURADAS NO WORKSPACE (multi-vertical)
  // ═══════════════════════════════════════════════════════════════════════
  // Lê a MESMA config que o Funil de Vendas usa (proposta_campos_padrao_config +
  // proposta_campos_customizados → montarCamposUnificados). Acha o campo de status
  // (o salvo na config do funil em localStorage, ou por heurística), pega as opções
  // dele e classifica cada uma em ganho/perdido/pipeline. Assim a aba "Funil" do
  // contato fala a MESMA língua do Funil de Vendas. Se nada estiver configurado,
  // a aba cai no fallback fixo (Novo Lead, etc).
  const REGEX_GANHO_FUNIL = /instal|ganho|conclu|fechad|aprovad|pago|ativ|sucesso|vendid|efetiv|finaliz/i;
  const REGEX_PERDIDO_FUNIL = /cancel|perd|recus|reprovad|inativ|desist|inadimpl/i;
  useEffect(() => {
    // if (!wsId) return; — removido (single-tenant)
    let cancel = false;
    (async () => {
      try {
        const [respConfig, respCustom] = await Promise.all([
          supabase.from("proposta_campos_padrao_config").select("*"),
          supabase.from("proposta_campos_customizados").select("*").eq("ativo", true).order("ordem", { ascending: true }),
        ]);
        const configs: ConfigCampoPadrao[] = (respConfig.data || []).map((c: any) => ({
          id: c.id, campo_slug: c.campo_slug, label_custom: c.label_custom,
          obrigatorio: c.obrigatorio, visivel: c.visivel, ordem: c.ordem,
          opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" && c.opcoes ? JSON.parse(c.opcoes) : null),
          placeholder_custom: c.placeholder_custom}));
        const customs: CampoCustom[] = (respCustom.data || []).map((c: any) => ({
          id: c.id, slug: c.slug, label: c.label, tipo: c.tipo,
          obrigatorio: c.obrigatorio, ordem: c.ordem,
          opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" ? JSON.parse(c.opcoes) : []),
          placeholder: c.placeholder, ativo: c.ativo}));
        const campos = montarCamposUnificados(configs, customs) as any[];
        let cfg: any = null;
        try { const raw = localStorage.getItem("funil_config_v1__unita"); cfg = raw ? JSON.parse(raw) : null; } catch {}
        const dropdowns = campos.filter(c => c.tipo === "dropdown" && c.visivel !== false);
        const statusField =
          (cfg?.campoStatus && campos.find(c => c.slug === cfg.campoStatus)) ||
          dropdowns.find(c => /status|situac|fase|etapa|estagio|estágio/i.test(c.slug) || /status|situac|fase|etapa/i.test(c.label)) ||
          dropdowns[0];
        const opcoes: string[] = (statusField?.opcoes || []) as string[];
        const ganho: string[] = cfg?.statusGanho || [];
        const perdido: string[] = cfg?.statusPerdido || [];
        const etapas = opcoes.map(o => {
          const tipo: "ganho" | "perdido" | "pipeline" =
            (ganho.includes(o) || (ganho.length === 0 && REGEX_GANHO_FUNIL.test(o))) ? "ganho" :
            (perdido.includes(o) || (perdido.length === 0 && REGEX_PERDIDO_FUNIL.test(o))) ? "perdido" :
            "pipeline";
          return { opcao: o, tipo };
        });
        if (!cancel) setFunilEtapas(etapas);
      } catch (e) {
        console.warn("[ChatSection] não consegui carregar etapas do funil (usa fallback fixo):", e);
      }
    })();
    return () => { cancel = true; };
  }, [wsId]);

  const WA_BASE = UNITAZAP_URL;  // mesmo backend single-tenant
  // 🆕 Backend wolf-meta — usado pra Instagram/Messenger (rotas /send/*)
  const META_BASE = process.env.NEXT_PUBLIC_META_URL || UNITAZAP_URL;
  const isAudioMsg = (txt: string) => typeof txt === "string" && ((txt.startsWith("[audio:") && txt.endsWith("]")) || /^\[audio\]\s*https?:\/\//i.test(txt));
  const audioFilename = (txt: string) => {
    // formato novo: [audio]http://.../arquivo.ogg  → devolve a URL completa
    const mUrl = String(txt).match(/^\[audio\]\s*(https?:\/\/\S+)/i);
    if (mUrl) return mUrl[1];
    // formato antigo: [audio:filename]
    return txt.replace(/^\[audio:/, "").replace(/\]$/, "");
  };

  // 🔔 ═══════════════════════════════════════════════════════════════════════════
  // FUNÇÕES DE NOTIFICAÇÃO SONORA
  // ═══════════════════════════════════════════════════════════════════════════
  // Cria/recupera o AudioContext (browser limita - precisa ser criado após user interaction).
  // Usado tanto pro som de chat NOVO quanto de mensagem em chat existente.
  const getAudioCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      try {
        // @ts-ignore — webkitAudioContext pra Safari
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return null;
        audioCtxRef.current = new Ctx();
      } catch { return null; }
    }
    // 🔓 AUTOPLAY POLICY: navegadores criam o AudioContext em estado "suspended" se o user
    // ainda não interagiu com a página. Aqui forçamos o resume() — funciona depois do
    // primeiro clique em qualquer botão da página. Sem isso, o som NUNCA toca.
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  // 🆕 ═══════════════════════════════════════════════════════════════════
  // BUSCA POR MENSAGEM — dispara query no banco quando user digita 3+ chars
  // ═══════════════════════════════════════════════════════════════════════
  // Comportamento:
  //   - Busca SÓ em mensagens (deixa nome/número pra busca client-side)
  //   - Debounce de 500ms (espera user parar de digitar)
  //   - Cache: se repete a mesma busca, reusa resultado
  //   - Limit 200 atendimentos pra não estourar memória
  //   - Loading visual quando tá buscando (buscandoMsgs)
  useEffect(() => {
    // if (!wsId) return; — removido (single-tenant)

    // Busca curta ou vazia = limpa o filtro de mensagens
    const buscaTrim = busca.trim();
    if (buscaTrim.length < 3) {
      setAtendimentosComMatch(null);
      setBuscandoMsgs(false);
      return;
    }

    // Cache hit
    const cacheKey = `unita::${buscaTrim.toLowerCase()}`;
    const cached = cacheBuscaRef.current.get(cacheKey);
    if (cached) {
      setAtendimentosComMatch(cached);
      setBuscandoMsgs(false);
      return;
    }

    // Debounce — espera 500ms sem digitar antes de buscar
    setBuscandoMsgs(true);
    const timeoutId = setTimeout(async () => {
      try {
        // 🆕 Escapa caracteres especiais do ILIKE: % e _ são curingas no Postgres.
        const buscaEscapada = buscaTrim.replace(/[\\%_]/g, "\\$&");

        // Query: busca mensagens cujo texto contenha a busca.
        // ⚠️ FIX: tabela mensagens NÃO tem atendimento_id — relação é só por numero+canal_id.
        // Multi-tenant (workspace_id obrigatório) + ILIKE pra busca case-insensitive.
        console.log(`🔍 [Busca] Procurando "${buscaTrim}" em mensagens do workspace unita`);
        const { data, error } = await supabase
          .from("mensagens")
          .select("numero, canal_id, mensagem")
          
          .ilike("mensagem", `%${buscaEscapada}%`)
          .order("created_at", { ascending: false })
          .limit(1000);

        if (error) {
          console.error("❌ [Busca] Erro:", error);
          setAtendimentosComMatch(new Set());
        } else {
          console.log(`🔍 [Busca] ${(data || []).length} mensagem(ns) bate(m) com "${buscaTrim}"`);
          if ((data || []).length > 0) {
            // Loga as 3 primeiras pra debug
            (data || []).slice(0, 3).forEach((m: any) => {
              console.log(`   → numero=${m.numero} canal=${m.canal_id} msg="${String(m.mensagem || "").slice(0, 60)}"`);
            });
          }
          // 🆕 Junta numero + canal_id pra montar chave única
          //    (mesmo número em canais diferentes é atendimento diferente)
          const matches = new Set<string>();
          (data || []).forEach((m: any) => {
            if (m.numero) {
              matches.add(`num:${m.numero}`);
              if (m.canal_id) matches.add(`numcanal:${m.numero}:${m.canal_id}`);
            }
          });

          // Salva no cache (max 20 entradas pra não vazar memória)
          if (cacheBuscaRef.current.size > 20) {
            const firstKey = cacheBuscaRef.current.keys().next().value;
            if (firstKey) cacheBuscaRef.current.delete(firstKey);
          }
          cacheBuscaRef.current.set(cacheKey, matches);

          setAtendimentosComMatch(matches);
        }
      } catch (e) {
        console.error("Erro inesperado na busca:", e);
        setAtendimentosComMatch(new Set());
      } finally {
        setBuscandoMsgs(false);
      }
    }, 500);

    // Cancela busca pendente se user continuar digitando
    return () => clearTimeout(timeoutId);
  }, [busca, wsId]);

  // 🔓 Listener global: na primeira interação do user com a página (clique/tecla/touch),
  // força resume do AudioContext. Garante que o som funcione mesmo se o user nunca clicou
  // num botão que chame getAudioCtx antes da primeira mensagem chegar.
  useEffect(() => {
    const desbloquear = () => {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    };
    window.addEventListener("click", desbloquear, { once: true });
    window.addEventListener("keydown", desbloquear, { once: true });
    window.addEventListener("touchstart", desbloquear, { once: true });
    return () => {
      window.removeEventListener("click", desbloquear);
      window.removeEventListener("keydown", desbloquear);
      window.removeEventListener("touchstart", desbloquear);
    };
  }, []);

  // Toca som tipo "ding-DONG" — 2 tons em sequência. Usado pra ATENDIMENTO NOVO (chat inédito).
  // Mais alto e perceptível pra atendente nunca perder.
  const tocarSomChatNovo = () => {
    if (!somAtivo) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      // Tom 1: 880Hz (A5) — agudo e atencional
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.value = 880;
      osc1.type = "sine";
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc1.connect(gain1).connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.2);

      // Tom 2: 1320Hz (E6) — mais agudo, dá a sensação "ding-DONG"
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.value = 1320;
      osc2.type = "sine";
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.18);
      gain2.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.20);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.18);
      osc2.stop(ctx.currentTime + 0.45);
    } catch (e) { console.warn("Erro ao tocar som de chat novo:", e); }
  };

  // Toca som tipo "ding" curto — 1 tom só, suave. Usado pra MENSAGEM em chat existente.
  // Mais discreto pra não cansar o atendente que recebe muitas msgs.
  const tocarSomMsgExistente = () => {
    if (!somAtivo) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660; // E5 — médio, suave
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.20);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) { console.warn("Erro ao tocar som de msg existente:", e); }
  };

  // Carrega preferência de som do localStorage no mount
  // Chave por usuário pra cada atendente ter sua própria configuração
  useEffect(() => {
    if (typeof window === "undefined" || !user?.email) return;
    try {
      const key = `wolf_som_ativo_${user.email}`;
      const saved = localStorage.getItem(key);
      // Default = true (ligado). Só desativa se EXPLICITAMENTE salvou "false".
      if (saved === "false") setSomAtivo(false);
      else setSomAtivo(true);
    } catch {}
  }, [user?.email]);

  // Toggle do som — também salva no localStorage
  const toggleSom = () => {
    setSomAtivo(prev => {
      const novo = !prev;
      try {
        if (user?.email) {
          localStorage.setItem(`wolf_som_ativo_${user.email}`, String(novo));
        }
      } catch {}
      return novo;
    });
  };
  // ═══════════════════════════════════════════════════════════════════════════

  // 🆕 Parsers de mídia nova (img/video/file) — formato: "[tipo:filename]" ou "[tipo:filename]\nlegenda"
  const parseMidia = (txt: string): { tipo: "img" | "video" | "file" | null; filename: string; legenda: string } => {
    if (typeof txt !== "string") return { tipo: null, filename: "", legenda: "" };
    // ── formato antigo: [img:filename] / [video:filename] / [file:filename]
    const match = txt.match(/^\[(img|video|file):([^\]]+)\](\n([\s\S]*))?$/);
    if (match) {
      return { tipo: match[1] as "img" | "video" | "file", filename: match[2], legenda: match[4] || "" };
    }
    // ── formato novo (canal WebJS): [midia]URL / [imagem]URL / [arquivo]URL / [documento]URL / [video]URL
    //    Vem a URL completa; o tipo é inferido pela extensão.
    const mUrl = txt.match(/^\[(midia|imagem|imagen|image|foto|video|arquivo|documento|doc|file)\]\s*(https?:\/\/\S+)(\n([\s\S]*))?$/i);
    if (mUrl) {
      const rotulo = mUrl[1].toLowerCase();
      const url = mUrl[2];
      const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
      const ehImg = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"].includes(ext);
      const ehVid = ["mp4", "mov", "avi", "mkv", "webm", "3gp"].includes(ext);
      let tipo: "img" | "video" | "file";
      if (rotulo === "video" || ehVid) tipo = "video";
      else if (["imagem", "imagen", "image", "foto"].includes(rotulo) || ehImg) tipo = "img";
      else if (["arquivo", "documento", "doc", "file"].includes(rotulo)) tipo = "file";
      else tipo = ehImg ? "img" : ehVid ? "video" : "file"; // [midia] → decide pela extensão
      return { tipo, filename: url, legenda: mUrl[4] || "" };
    }
    return { tipo: null, filename: "", legenda: "" };
  };

  // Ícone baseado na extensão do arquivo (pra tipo=file)
  const iconePorExtensao = (filename: string): string => {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (["pdf"].includes(ext)) return "📕";
    if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (["doc", "docx", "rtf"].includes(ext)) return "📄";
    if (["ppt", "pptx"].includes(ext)) return "📽️";
    if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
    if (["txt"].includes(ext)) return "📝";
    return "📎";
  };
  // 🆕 URL pública de mídia — detecta canal pra usar a base certa.
  // - Canais Wolf Meta (tipo='meta'/'instagram'/'messenger') → ${META_BASE}/midia/<filename>
  // - Canais WhatsApp (tipo='webjs'/'waba') → ${WA_BASE}/audios/<filename>
  // O nome `audioUrl` foi mantido pra não quebrar chamadas existentes.
  const audioUrl = (filename: string, canalId?: number | string | null) => {
    if (canalId !== undefined && canalId !== null) {
      const canal = canais.find(c => String(c.id) === String(canalId));
      const tipo = canal?.tipo;
      if (tipo === "meta" || tipo === "instagram" || tipo === "messenger") {
        return `${META_BASE}/midia/${filename}`;
      }
    }
    return `${WA_BASE}/audios/${filename}`;
  };

  // 🆕 Resolve a URL final de uma mídia. Se já vier URL completa (formato novo
  //    [midia]http://...), usa ela; senão monta via audioUrl (formato antigo).
  //    ⚠️ O backend (IP cru, cert autoassinado) é bloqueado pelo navegador quando
  //    carregado inline em página HTTPS. Por isso roteamos pelo proxy do próprio
  //    domínio (/api/midia?u=...), que tem certificado válido e busca o arquivo
  //    servidor→servidor. Em http (dev/localhost) usa a URL direta.
  const urlMidiaFinal = (filenameOuUrl: string, canalId?: number | string | null): string => {
    const u = /^https?:\/\//i.test(filenameOuUrl) ? filenameOuUrl : audioUrl(filenameOuUrl, canalId);
    const ehHttpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
    // Só faz sentido proxiar URLs absolutas http(s). Em página HTTPS, sempre proxia
    // (resolve cert autoassinado E mixed-content de uma vez).
    if (/^https?:\/\//i.test(u) && ehHttpsPage) {
      return `/api/midia?u=${encodeURIComponent(u)}`;
    }
    return u;
  };

  const wa = async (rota: string, body?: object) => {
    if (body !== undefined) {
      const resp = await fetch(`/api/whatsapp?rota=${rota}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return resp.json();
    }
    const resp = await fetch(`/api/whatsapp?rota=${rota}`);
    return resp.json();
  };

  const nomeDoAtendente = (emailOrBot: string): string => {
    if (!emailOrBot) return "—";
    if (emailOrBot === "BOT") return "BOT";
    if (emailOrBot === "sistema") return "Sistema";
    const u = usuariosWs.find(u => u.email?.toLowerCase() === emailOrBot.toLowerCase());
    if (u?.nome) return u.nome;
    return emailOrBot.split("@")[0];
  };

  const nomeDoCanal = (canalId?: number, origem?: string | null): string => {
    if (!canalId) return "—";
    const c = canais.find(ch => ch.id === canalId);
    if (!c) return `Canal ${canalId}`;
    // 🆕 Canal Meta: mostra "Instagram" ou "Messenger" baseado na origem
    if (c.tipo === "meta" && origem === "instagram") return "Instagram";
    if (c.tipo === "meta" && origem === "messenger") return "Messenger";
    if (c.tipo === "instagram") return "Instagram";
    if (c.tipo === "messenger") return "Messenger";
    return c.nome;
  };

  const iconeCanal = (canalId?: number, origem?: string | null): string => {
    if (!canalId) return "📱";
    const c = canais.find(ch => ch.id === canalId);
    if (!c) return "📱";
    // 🆕 Canal Meta: ícone baseado em origem
    if (c.tipo === "meta" && origem === "instagram") return "📷";
    if (c.tipo === "meta" && origem === "messenger") return "💬";
    if (c.tipo === "instagram") return "📷";
    if (c.tipo === "messenger") return "💬";
    if (c.tipo === "waba") return "🔗";
    if (c.tipo === "meta") return "📲"; // canal meta sem origem ainda
    return "📱";
  };

  const fetchCanais = async () => {
    // if (!wsId) return; — removido (single-tenant)
    const { data } = await supabase.from("conexoes").select("id, nome, tipo, modulos");
    setCanais(data || []);
  };

  // 🆕 LIMITE DE ATENDIMENTOS NÃO RESOLVIDOS — quando o workspace tem mais que LIMITE_ATIVOS
  // atendimentos não-resolvidos, a gente auto-resolve os mais antigos pra manter o banco
  // enxuto (e o frontend rápido). Configurado pra 5000.
  // Definido fora da função pra ficar fácil de ajustar no futuro.
  const LIMITE_ATIVOS = 5000;

  // 🆕 Auto-limpeza: chamada ao fim do fetchAtendimentos.
  // Se total de não-resolvidos > LIMITE_ATIVOS, resolve os excedentes (mais antigos por updated_at).
  // Insere mensagem de sistema explicando.
  // Roda ASYNC e em background — não bloqueia a UI.
  const autoLimparExcedentes = async () => {
    // if (!wsId) return; — removido (single-tenant)
    try {
      // Conta total de não-resolvidos
      const { count } = await supabase
        .from("atendimentos")
        .select("id", { count: "exact", head: true })
        
        .neq("status", "resolvido");

      const total = count || 0;
      if (total <= LIMITE_ATIVOS) return; // dentro do limite, nada a fazer

      const excedentes = total - LIMITE_ATIVOS;
      console.log(`🧹 Auto-limpeza: ${total} não-resolvidos > ${LIMITE_ATIVOS}, resolvendo os ${excedentes} mais antigos`);

      // Pega os mais antigos (updated_at ASC) — usa range pra trazer só os excedentes
      // Pra ser seguro: nunca processa mais que 1000 por vez (se passou muito do limite, faz aos poucos)
      const qtdAResolver = Math.min(excedentes, 1000);
      const { data: alvos } = await supabase
        .from("atendimentos")
        .select("id, numero, canal_id")
        
        .neq("status", "resolvido")
        .order("updated_at", { ascending: true, nullsFirst: true })
        .limit(qtdAResolver);

      if (!alvos || alvos.length === 0) return;

      // Resolve em batch
      const ids = alvos.map(a => a.id);
      const LOTE = 200;
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE);
        await supabase.from("atendimentos").update({ status: "resolvido" })
          .in("id", lote)
          ;
      }

      // Insere mensagens de sistema explicando
      const mensagensSistema = alvos.map(a => ({
        numero: a.numero,
        mensagem: `Atendimento encerrado automaticamente — limite de ${LIMITE_ATIVOS} atendimentos ativos atingido (workspace mantém os mais recentes)`,
        de: "sistema",
        canal_id: a.canal_id || null}));
      for (let i = 0; i < mensagensSistema.length; i += LOTE) {
        const lote = mensagensSistema.slice(i, i + LOTE);
        await supabase.from("mensagens").insert(lote);
      }

      console.log(`✅ Auto-limpeza concluída: ${alvos.length} atendimento(s) resolvidos`);
    } catch (e) {
      console.error("❌ Erro na auto-limpeza:", e);
      // não mostra alert pro user — é processo de manutenção em background
    }
  };

  const fetchAtendimentos = async () => {
    // if (!wsId) return; — removido (single-tenant)
    // 🆕 Paginação — Supabase corta em 1000 por query. Pra pegar até LIMITE_ATIVOS (5000),
    // faz 5 queries de 1000 em 1000 ordenadas por updated_at desc.
    // Antes só trazia 1000, então atendimentos antigos sumiam da lista mesmo estando no banco.
    const PAGE_SIZE = 1000;
    const TOTAL_LIMITE = LIMITE_ATIVOS; // 5000
    let lista: Atendimento[] = [];
    let offset = 0;
    while (offset < TOTAL_LIMITE) {
      const { data: pagina, error } = await supabase.from("atendimentos").select("*")
        
        .order("updated_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        console.error("Erro fetchAtendimentos paginado:", error);
        break;
      }
      if (!pagina || pagina.length === 0) break; // chegou no fim
      lista = lista.concat(pagina as Atendimento[]);
      if (pagina.length < PAGE_SIZE) break; // última página tinha menos = chegou no fim
      offset += PAGE_SIZE;
    }

    // 🔔 DETECÇÃO DE ATENDIMENTO NOVO — pra tocar som distinto
    // Lógica: se um atendimento aparece agora mas o ID NÃO estava no Set de conhecidos,
    // é um chat novo. Toca som "ding-DONG".
    // Na PRIMEIRA carga (F5/login) ignora — só popula o Set sem tocar som.
    if (primeiraCargaAtendimentosRef.current) {
      lista.forEach(a => atendimentosConhecidosRef.current.add(a.id));
      primeiraCargaAtendimentosRef.current = false;
    } else {
      const novos = lista.filter(a => !atendimentosConhecidosRef.current.has(a.id));
      // Só toca som se tem novos E o user pode ver eles (respeita filtro de permissão)
      // Pra atendentes comuns: só toca se chat foi atribuído pra eles ou tá na fila deles
      if (novos.length > 0) {
        // Filtra novos que esse atendente vai conseguir ver
        const novosVisiveis = novos.filter(a => {
          const aba = (() => {
            if (a.status === "resolvido") return "finalizados";
            if (a.atendente === "BOT") return "automatico";
            const atendenteEhReal = !!a.atendente && !["BOT", "Humano"].includes(a.atendente);
            if (atendenteEhReal) return "abertos";
            if (a.status === "pendente") return "aguardando";
            return "abertos";
          })();
          // Permissão: dono/supervisor vê tudo. Atendente comum só vê os seus + os pendentes/automaticos
          if (isDono || permissoes.chat_todos) return true;
          if (aba === "abertos" || aba === "finalizados") return a.atendente === user?.email;
          return true; // pendentes/automaticos todos veem
        });
        if (novosVisiveis.length > 0) {
          tocarSomChatNovo();
        }
        // Adiciona os novos no Set (todos, mesmo os não visíveis — pra não tocar de novo se ficar visível depois)
        novos.forEach(a => atendimentosConhecidosRef.current.add(a.id));
      }
    }

    // 🆕 FILTRO POR MÓDULO: se moduloFiltro setado (ex: "cobranca"), só mostra
    //    atendimentos de canais que têm esse módulo marcado em conexoes.modulos.
    let listaFinal = lista;
    if (moduloFiltro && (canais || []).length > 0) {
      const canaisDoModulo = new Set(
        (canais || [])
          .filter(c => Array.isArray((c as any).modulos) && (c as any).modulos.includes(moduloFiltro))
          .map(c => String(c.id))
      );
      listaFinal = lista.filter(a => canaisDoModulo.has(String((a as any).canal_id)));
    }
    // 📡 2ª TRAVA: acesso por canal (usuário + grupo). Dono/super/chat_todos ignora.
    //    Se não é dono e o Set já carregou, só vê canais que estão no Set.
    const veTudoCanais = isDono || perm.superAdmin || !!permissoes.chat_todos;
    if (!veTudoCanais && canaisPermitidos) {
      listaFinal = listaFinal.filter(a => canaisPermitidos.has(Number((a as any).canal_id)));
    }

    setAtendimentos(listaFinal);

    // 🆕 Dispara auto-limpeza em background (não aguarda).
    // Só dono/supervisor dispara — atendente comum não tem permissão de fazer update em massa.
    if (isDono || permissoes.chat_todos) {
      autoLimparExcedentes();
    }
  };

  const fetchHistorico = async (numero: string, canalId?: number) => {
    // if (!wsId) return; — removido (single-tenant)  // 🔒 SEGURANÇA: sem wsId, não busca nada (evita vazamento)
    // 🔒 MULTI-TENANT: sempre filtra por workspace_id — antes vazava mensagens entre workspaces
    // que tivessem o mesmo número (ex: lead da Abc + lead da RM TELECOM com mesmo telefone).
    let query = supabase.from("mensagens").select("*")
      .eq("numero", numero)
      ;
    if (canalId) query = query.eq("canal_id", canalId);
    const { data } = await query.order("created_at", { ascending: true });
    setHistorico(data || []);
  };

  // 🆕 Atualizar manualmente — chamado pelo botão 🔄 da toolbar.
  // Recarrega lista de atendimentos + histórico do chat ativo (se tiver) + canais/usuários.
  // Mostra feedback visual via state `atualizando` (animação de spin no emoji).
  // Tempo mínimo de 600ms pro feedback ser perceptível mesmo se a query for instantânea.
  const atualizarManual = async () => {
    if (atualizando) return; // evita clique duplo
    setAtualizando(true);
    const t0 = Date.now();
    try {
      const tarefas: Promise<any>[] = [fetchAtendimentos()];
      if (atendimentoAtivo) {
        tarefas.push(fetchHistorico(atendimentoAtivo.numero, atendimentoAtivo.canal_id));
      }
      await Promise.all(tarefas);
    } catch (e) {
      console.error("Erro ao atualizar:", e);
    }
    // Garante que o spin dura no mínimo 600ms (UX — pra o usuário ver que aconteceu)
    const passou = Date.now() - t0;
    if (passou < 600) await new Promise(r => setTimeout(r, 600 - passou));
    setAtualizando(false);
  };

  const fetchEtiquetasWorkspace = async () => {
    // if (!wsId) return; — removido (single-tenant)
    const { data } = await supabase.from("etiquetas").select("*").order("nome", { ascending: true });
    setEtiquetasWorkspace(data || []);
  };

  // 🆕 Carrega o mapa de etiquetas por atendimento DO WORKSPACE INTEIRO.
  // Por que: a lista de atendimentos precisa mostrar as tags coloridas embaixo do nome (LUANA,
  // VENDAS, VIVO, etc). Antes a gente só carregava as etiquetas do atendimento ATIVO (quando
  // abria), então a lista nunca conseguia mostrar.
  // 
  // Estratégia: como atendimento_etiquetas pode ter milhares de linhas em workspaces grandes,
  // a gente filtra por atendimentos do workspace via .in() em batches. Os atendimentos já
  // foram carregados (até 5000) então o array `atendimentos` é a fonte certa.
  const fetchEtiquetasPorAtendimento = async () => {
    if (!wsId || atendimentos.length === 0) return;
    try {
      // Pega os IDs em batches de 500 pra evitar URL muito longa
      const ids = atendimentos.map(a => a.id);
      const LOTE = 500;
      const mapa: Record<number, number[]> = {};
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE);
        const { data } = await supabase
          .from("atendimento_etiquetas")
          .select("atendimento_id, etiqueta_id")
          .in("atendimento_id", lote);
        (data || []).forEach(rel => {
          if (!mapa[rel.atendimento_id]) mapa[rel.atendimento_id] = [];
          mapa[rel.atendimento_id].push(rel.etiqueta_id);
        });
      }
      setEtiquetasPorAtendimento(mapa);
    } catch (e) {
      console.error("Erro ao carregar mapa de etiquetas:", e);
    }
  };

  const fetchEtiquetasAtendimento = async (atendimentoId: number) => {
    const { data } = await supabase.from("atendimento_etiquetas").select("etiqueta_id").eq("atendimento_id", atendimentoId);
    setEtiquetasAtendimento((data || []).map(d => d.etiqueta_id));
  };

  const fetchUsuariosWorkspace = async () => {
    // if (!wsId) return; — removido (single-tenant)
    const subs: UsuarioWs[] = [];
    // 🆕 Traz fila também — necessário pra regra de visibilidade multi-fila funcionar.
    // Frontend filtra atendimento por: usuario.fila contém a fila do atendimento (CSV).
    // ⚠️ UNITA: a tabela é `usuarios` (usuarios_workspace é do Wolf e NÃO existe aqui)
    const { data } = await supabase.from("usuarios").select("email, nome, fila").eq("ativo", true);
    if (data) subs.push(...data);
    if (workspace?.owner_email) { subs.push({ email: workspace.owner_email, nome: workspace.nome || "Dono" }); }
    setUsuariosWs(subs);
    // 🆕 Filas cadastradas no sistema — antes a lista era derivada só dos atendimentos,
    // então fila sem atendimento nunca aparecia no filtro nem no "Encaminhar para fila".
    try {
      const { data: fl } = await supabase.from("filas").select("nome").eq("ativo", true).order("nome", { ascending: true });
      setFilasBanco(((fl || []) as { nome: string | null }[]).map(f => f.nome || "").filter(Boolean));
    } catch { setFilasBanco([]); }
    if (user?.email) {
      const eu = subs.find(s => s.email?.toLowerCase() === user.email?.toLowerCase());
      if (eu?.nome) setMeuNome(eu.nome);
      else setMeuNome(user.email.split("@")[0]);
    }
  };

  const toggleEtiqueta = async (etiquetaId: number) => {
    if (!atendimentoAtivo) return;
    const jaTem = etiquetasAtendimento.includes(etiquetaId);
    setSalvandoContato(true);
    try {
      if (jaTem) {
        await supabase.from("atendimento_etiquetas").delete().eq("atendimento_id", atendimentoAtivo.id).eq("etiqueta_id", etiquetaId);
        setEtiquetasAtendimento(prev => prev.filter(id => id !== etiquetaId));
        // 🔧 FIX: atualiza mapa da lista lateral imediatamente (sem esperar realtime)
        setEtiquetasPorAtendimento(prev => ({
          ...prev,
          [atendimentoAtivo.id]: (prev[atendimentoAtivo.id] || []).filter(id => id !== etiquetaId)
        }));
      } else {
        await supabase.from("atendimento_etiquetas").insert([{ atendimento_id: atendimentoAtivo.id, etiqueta_id: etiquetaId }]);
        setEtiquetasAtendimento(prev => [...prev, etiquetaId]);
        // 🔧 FIX: atualiza mapa da lista lateral imediatamente (sem esperar realtime)
        setEtiquetasPorAtendimento(prev => ({
          ...prev,
          [atendimentoAtivo.id]: [...(prev[atendimentoAtivo.id] || []), etiquetaId]
        }));
      }
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
    setSalvandoContato(false);
  };

  const inserirMensagemSistema = async (numero: string, texto: string, canalId?: number) => {
    try {
      const payload: any = { numero, mensagem: texto, de: "sistema" };
      if (canalId) payload.canal_id = canalId;
      await supabase.from("mensagens").insert([payload]);
    } catch (e) { console.error("Erro ao inserir mensagem de sistema:", e); }
  };

  // 🆕 Encerra em massa atendimentos pendentes/aguardando antigos.
  // - dias: corte de antiguidade (1, 2, 3 ou 7 dias)
  // - critério: status=pendente E updated_at antes de [hoje - X dias]
  // - ação: status=resolvido + mensagem do sistema "Encerrado por inatividade"
  //
  // ⚠️ IMPORTANTE: busca TODOS os candidatos no banco em paginação (1000 em 1000).
  // Antes filtrava só o array em memória, mas como o array tá limitado a 1000, em
  // workspaces grandes (RM TELECOM com 5000+ pendentes) o filtro nem via os antigos.
  // Agora busca direto do banco com .lt("updated_at", corte) e pagina até trazer tudo.
  const encerrarAtendimentosAntigos = async (dias: 1 | 2 | 3 | 7) => {
    // if (!wsId) return; — removido (single-tenant)
    setEncerrandoAntigos(true);
    try {
      const corteDate = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

      // 1) Busca TODOS os candidatos paginando (1000 em 1000) — sem isso, em workspaces grandes
      //    o Supabase corta na primeira query e a gente só limpa parte.
      // 🔧 FIX: usa OR com fallback pra created_at quando updated_at é NULL (leads antigos
      //          criados em versões sem trigger de updated_at). Sem isso, ficavam zumbis
      //          eternos — o botão "Limpar" deixava eles pra trás porque NULL < x = NULL.
      const PAGE_SIZE = 1000;
      let alvos: Array<{ id: number; numero: string; canal_id: number | null }> = [];
      let offset = 0;
      let temMais = true;
      let iter = 0;
      while (temMais && iter < 50) { // safety: máx 50.000 atendimentos por chamada
        iter++;
        const { data: lote, error } = await supabase
          .from("atendimentos")
          .select("id, numero, canal_id")
          
          .eq("status", "pendente")
          .or(`updated_at.lt.${corteDate},and(updated_at.is.null,created_at.lt.${corteDate})`)
          .order("id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (!lote || lote.length === 0) {
          temMais = false;
        } else {
          alvos = alvos.concat(lote as any);
          if (lote.length < PAGE_SIZE) temMais = false;
          else offset += PAGE_SIZE;
        }
      }

      if (alvos.length === 0) {
        notify(`Nenhum atendimento pendente há mais de ${dias} dia(s).`, "info");
        setEncerrandoAntigos(false);
        setShowEncerrarAntigos(false);
        return;
      }

      // 2) Update em batch — Supabase aceita .in("id", [...]) pra atualizar várias linhas
      // Faz em lotes de 200 ids pra evitar query muito grande
      const ids = alvos.map(a => a.id);
      const LOTE = 200;
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE);
        await supabase.from("atendimentos").update({ status: "resolvido" })
          .in("id", lote)
          ; // 🔒 defesa em profundidade — confirma workspace
      }

      // 3) Mensagens de sistema — insere em batch também
      const meuNome = user?.email ? user.email.split("@")[0] : "Sistema";
      const mensagensSistema = alvos.map(a => ({
        numero: a.numero,
        mensagem: `Atendimento encerrado por inatividade (${dias} dia${dias > 1 ? "s" : ""} sem nova interação) — ação de ${meuNome}`,
        de: "sistema",
        canal_id: a.canal_id || null}));
      for (let i = 0; i < mensagensSistema.length; i += LOTE) {
        const lote = mensagensSistema.slice(i, i + LOTE);
        await supabase.from("mensagens").insert(lote);
      }

      // 4) Finaliza sessões de fluxo se existirem
      try {
        // Pra evitar query gigante, processa em lotes
        const numeros = alvos.map(a => a.numero);
        for (let i = 0; i < numeros.length; i += LOTE) {
          const lote = numeros.slice(i, i + LOTE);
          await supabase.from("fluxo_sessoes").update({ status: "finalizado" })
            .in("numero", lote)
            
            .eq("status", "ativo");
        }
      } catch (e) { /* ignora — pode não ter sessões */ }

      notify(`${alvos.length} atendimento(s) encerrado(s) por inatividade.`, "sucesso");
      await fetchAtendimentos();
      setShowEncerrarAntigos(false);
    } catch (e: any) {
      console.error("Erro ao encerrar antigos:", e);
      notify(traduzirErro(e), "erro");
    }
    setEncerrandoAntigos(false);
  };

  // 🆕 Quantos pendentes existem com mais de N dias — usa o state alimentado pelo banco.
  // O state é atualizado pelo useEffect abaixo via query count: "exact" do Supabase.
  const contarPendentesAntigos = (dias: 1 | 2 | 3 | 7): number => {
    return pendentesAntigosCount[dias] || 0;
  };

  // 🆕 useEffect — busca contagens REAIS do banco (não limitado a 1000)
  // Roda: ao montar, ao mudar de workspace, e a cada vez que atendimentos é atualizado
  // (depois de encerrar antigos, depois de fetchAtendimentos, etc).
  // 🔧 FIX: leads antigos podem ter updated_at = NULL (criados em versões antigas do sistema
  //         sem trigger). Antes, .lt("updated_at", corte) ignorava silenciosamente esses
  //         caras (PostgreSQL: NULL < x sempre é NULL ≈ falso). Resultado: usuário via
  //         "4 pendentes há +2 dias" mas tinha dezenas. Agora usa OR com fallback pra
  //         created_at quando updated_at é null — mesmo critério do badge "18d" do card.
  useEffect(() => {
    // if (!wsId) return; — removido (single-tenant)
    let cancelado = false;

    const carregarCounts = async () => {
      const novosCounts: { [dias: number]: number } = {};
      for (const dias of [1, 2, 3, 7]) {
        const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("atendimentos")
          .select("id", { count: "exact", head: true })
          
          .eq("status", "pendente")
          .or(`updated_at.lt.${corte},and(updated_at.is.null,created_at.lt.${corte})`);
        if (cancelado) return;
        novosCounts[dias] = count || 0;
      }
      if (!cancelado) setPendentesAntigosCount(novosCounts);
    };

    carregarCounts();

    return () => { cancelado = true; };
  }, [wsId, atendimentos.length]); // recarrega quando a lista muda (após limpeza, novo lead, etc)

  useEffect(() => {
    // if (!wsId) return; — removido (single-tenant)
    fetchCanais();
    fetchAtendimentos();
    fetchEtiquetasWorkspace();
    fetchUsuariosWorkspace();

    // 🆕 Busca config da roleta (pra saber se botão "Parar BOT/IA" aparece)
    const fetchRoleta = async () => {
      const { data } = await supabase.from("roleta_config").select("ativa").maybeSingle();
      setRoletaAtiva(!!data?.ativa);
    };
    fetchRoleta();

    const ch = supabase.channel("atendimentos_chat_rt_" + wsId)
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos"}, () => fetchAtendimentos())
      .on("postgres_changes", { event: "*", schema: "public", table: "etiquetas"}, () => fetchEtiquetasWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => fetchUsuariosWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "filas" }, () => fetchUsuariosWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "conexoes"}, () => fetchCanais())
      // 🆕 Atualiza em tempo real se o dono ligar/desligar a roleta
      .on("postgres_changes", { event: "*", schema: "public", table: "roleta_config"}, () => fetchRoleta())
      .subscribe();
    const polling = setInterval(() => fetchAtendimentos(), 5000);
    return () => { supabase.removeChannel(ch); clearInterval(polling); };
  }, [wsId, workspace?.owner_email, user?.email]);

  // 🆕 useEffect próprio pro mapa de etiquetas por atendimento.
  // Roda quando: lista de atendimentos muda OU alguma relação atendimento_etiqueta muda no banco.
  // Realtime: subscribe na tabela atendimento_etiquetas (sem filtro de workspace porque a tabela
  // não tem essa coluna — o filtro acontece via .in(ids) na função).
  useEffect(() => {
    // if (!wsId) return; — removido (single-tenant)
    fetchEtiquetasPorAtendimento();

    const ch = supabase.channel("etiq_atend_rt_" + wsId)
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimento_etiquetas" }, () => fetchEtiquetasPorAtendimento())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // Dependência em atendimentos.length pra recarregar quando lista muda (novo atendimento entrou/saiu)
  }, [wsId, atendimentos.length]);

  // 🔔 ═══════════════════════════════════════════════════════════════════════════
  // useEffect: COMPUTA NÃO LIDAS + TOCA SOM EM MSG NOVA  (VERSÃO 3 — PAGINAÇÃO)
  // ═══════════════════════════════════════════════════════════════════════════
  // Histórico das tentativas:
  // V1: 1 query gigante → falhava porque Supabase corta em 1000 linhas
  // V2: 1 query por atendimento → estourava rate limit do Supabase (503 Service Unavailable)
  // V3 (atual): query paginada — pega 1000 em 1000 até trazer tudo, em poucas queries
  //
  // Como funciona:
  // - Pega só as msgs dos últimos 7 dias do workspace, do tipo "cliente"
  // - Pagina de 1000 em 1000 (range do Supabase)
  // - Junta no frontend, comparra com visualizado_em de cada atendimento
  //
  // Resultado: ~3-5 queries totais ao invés de 555. Não estoura rate limit.
  useEffect(() => {
    if (!wsId || atendimentos.length === 0) {
      setNaoLidasPorAtendimento({});
      return;
    }

    let cancelado = false;

    (async () => {
      try {
        // Pega só msgs dos últimos 7 dias (suficiente — chats mais antigos raramente recebem msg)
        const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Paginação: pega de 1000 em 1000 até cobrir tudo
        const PAGE_SIZE = 1000;
        const todasMsgs: Array<{ numero: string; canal_id: number | null; created_at: string }> = [];
        let offset = 0;
        let temMais = true;

        while (temMais && !cancelado) {
          const { data, error } = await supabase
            .from("mensagens")
            .select("numero, canal_id, created_at")
            
            .eq("de", "cliente")
            .gte("created_at", seteDiasAtras)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) {
            console.warn("Erro ao buscar mensagens pra contar não lidas:", error);
            break;
          }
          if (!data || data.length === 0) {
            temMais = false;
            break;
          }
          todasMsgs.push(...data);
          if (data.length < PAGE_SIZE) {
            temMais = false; // veio menos de 1000 = chegamos no fim
          } else {
            offset += PAGE_SIZE;
          }
          // Limite de segurança: nunca passar de 10 páginas (10 mil mensagens em 7 dias é absurdo)
          if (offset >= 10000) {
            temMais = false;
          }
        }

        if (cancelado) return;

        // Agora calcula não lidas pra cada atendimento usando os dados em memória
        const novoMap: Record<number, number> = {};
        const ativos = atendimentos.filter(a => a.status !== "resolvido");

        for (const a of ativos) {
          const threshold = a.visualizado_em || a.created_at;
          const thresholdMs = new Date(threshold).getTime();

          const count = todasMsgs.filter(m =>
            m.numero === a.numero &&
            (!a.canal_id || m.canal_id === a.canal_id) &&
            new Date(m.created_at).getTime() > thresholdMs
          ).length;

          if (count > 0) novoMap[a.id] = count;
        }

        if (cancelado) return;

        // 🔔 DETECÇÃO DE MENSAGEM NOVA — toca som "ding" se aumentou desde último cálculo
        const ultimas = ultimaQtdNaoLidasRef.current;
        let teveAumento = false;
        for (const id in novoMap) {
          const idNum = parseInt(id);
          const antes = ultimas[idNum] || 0;
          const agora = novoMap[idNum];
          if (agora > antes && idNum !== atendimentoAtivo?.id) {
            teveAumento = true;
          }
        }
        const primeiraVez = Object.keys(ultimas).length === 0;
        if (teveAumento && !primeiraVez) {
          tocarSomMsgExistente();
        }
        ultimaQtdNaoLidasRef.current = novoMap;
        setNaoLidasPorAtendimento(novoMap);
      } catch (err) {
        console.warn("Erro no cálculo de não lidas:", err);
      }
    })();

    return () => { cancelado = true; };
  }, [atendimentos, wsId, atendimentoAtivo?.id]);

  // 🔔 Atualiza title da aba do navegador com (N) UnitaSystem quando tem não lidas
  useEffect(() => {
    if (typeof document === "undefined") return;
    // Soma TODAS as não lidas (incluindo as não visíveis ao user atual — title é global)
    // Filtra: só conta as que o user pode ver (atendentes comuns só vêem os deles)
    let total = 0;
    for (const a of atendimentos) {
      const count = naoLidasPorAtendimento[a.id];
      if (!count) continue;
      // Verifica se o user vê esse atendimento
      const atendenteEhReal = !!a.atendente && !["BOT", "Humano"].includes(a.atendente);
      const aba = a.status === "resolvido" ? "finalizados" :
                  a.atendente === "BOT" ? "automatico" :
                  atendenteEhReal ? "abertos" :
                  a.status === "pendente" ? "aguardando" : "abertos";
      const podeVer = (isDono || permissoes.chat_todos) ||
                      (aba === "abertos" || aba === "finalizados" ? a.atendente === user?.email : true);
      if (podeVer) total += count;
    }
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) UnitaSystem` : "UnitaSystem";
    return () => {
      // Restaura title quando componente desmonta (ex: navegou pra outra página)
      if (typeof document !== "undefined") document.title = "UnitaSystem";
    };
  }, [naoLidasPorAtendimento, atendimentos, isDono, permissoes.chat_todos, user?.email]);

  useEffect(() => {
    if (!atendimentoAtivo) { setEtiquetasAtendimento([]); return; }
    setHistorico([]);
    // 🆕 Ao abrir um atendimento NOVO, reseta o sticky pra true e esconde o badge —
    // o user acabou de entrar no chat, faz sentido ir pro fundo.
    setStickyFundo(true);
    setTemMensagemNova(false);
    fetchHistorico(atendimentoAtivo.numero, atendimentoAtivo.canal_id);
    fetchEtiquetasAtendimento(atendimentoAtivo.id);
    const num = atendimentoAtivo.numero; const cId = atendimentoAtivo.canal_id;
    // 🔒 SEGURANÇA MULTI-TENANT: filter `workspace_id=eq.unita` no postgres_changes garante
    // que o canal só recebe INSERTs deste workspace. Antes recebia de TODOS workspaces e filtrava
    // no JS — vulnerável (e desperdiçava ciclos). Agora o Postgres filtra na fonte.
    const ch = supabase.channel(`msgs_unita_${num}_${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens"}, (payload) => {
        const m = payload.new as Mensagem;
        // Defesa extra: confere workspace mesmo após filter (não custa nada)
        if (m.numero === num && (!cId || m.canal_id === cId)) {
          setHistorico(p => [...p, m]);
          // 🆕 Se o user está scrollado pra cima lendo msg antiga, NÃO arrasta ele pra baixo —
          // apenas sinaliza que chegou msg nova. Ele decide quando descer clicando no badge.
          if (!stickyFundoRef.current) {
            setTemMensagemNova(true);
          }
        }
      }).subscribe();
    const polling = setInterval(() => fetchHistorico(num, cId), 3000);
    return () => { supabase.removeChannel(ch); clearInterval(polling); };
  }, [atendimentoAtivo?.numero, atendimentoAtivo?.id, atendimentoAtivo?.canal_id]);
// 🔧 FIX: SINCRONIZA atendimentoAtivo COM DADOS MAIS RECENTES DO ARRAY atendimentos
  // Antes: ao clicar "Parar BOT", "Assumir", etc, o DB atualizava e fetchAtendimentos()
  // trazia os dados novos pro array, MAS atendimentoAtivo era um state separado que ficava
  // com dados antigos (stale). Header mostrava atendente=BOT mesmo após assumir → F5 pra ver.
  // Agora: sincroniza automaticamente sempre que atendimentos muda.
  useEffect(() => {
    if (!atendimentoAtivo) return;
    const atualizado = atendimentos.find(a => a.id === atendimentoAtivo.id);
    if (!atualizado) return;
    const camposChave: (keyof Atendimento)[] = [
      'status', 'atendente', 'fila', 'nome', 'mensagem', 'bloqueado_ia', 'bloqueado_fluxo',
      'bloqueado_typebot', 'bloqueado_contato', 'bloqueado_ate', 'atendente_finalizou',
      'funil_etapa', 'kanban_coluna', 'demanda', 'valor', 'email', 'notas', 'avaliacao',
      'origem', 'updated_at', 'equipe_id'
    ];
    const mudou = camposChave.some(campo => atualizado[campo] !== atendimentoAtivo[campo]);
    if (mudou) {
      setAtendimentoAtivo(prev => prev ? { ...prev, ...atualizado } : prev);
    }
  }, [atendimentos]);

  // 🆕 Ref que espelha o state de stickyFundo — necessário porque o listener do realtime
  // é criado uma vez e capturaria o valor inicial de stickyFundo no closure (stale state).
  const stickyFundoRef = useRef(stickyFundo);
  useEffect(() => { stickyFundoRef.current = stickyFundo; }, [stickyFundo]);

  // 🆕 Handler do scroll — detecta se o user está "colado" no fundo do chat
  // (tolerância de 120px pra não virar cacete quando dá um leve overshoot)
  const onScrollChat = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanciaDoFundo = el.scrollHeight - el.scrollTop - el.clientHeight;
    const estaNoFundo = distanciaDoFundo < 120;
    if (estaNoFundo !== stickyFundo) setStickyFundo(estaNoFundo);
    if (estaNoFundo && temMensagemNova) setTemMensagemNova(false);
  };

  // 🆕 Scroll automático SÓ se o usuário estiver colado ao fundo (sticky=true).
  // Se ele tá lendo msg antiga lá em cima, o polling de 3s NÃO vai mais arrastar ele de volta.
  useEffect(() => {
    if (!stickyFundo) return;
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [historico, stickyFundo]);

  // 🆕 Função pro botão "↓ Nova mensagem" — leva o user pro fundo manualmente e limpa o badge
  const irParaFundo = () => {
    setStickyFundo(true);
    setTemMensagemNova(false);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const filas = [...new Set([...filasBanco, ...atendimentos.map(a => a.fila)])].filter(Boolean);
  const atendentesEmails = [...new Set(atendimentos.map(a => a.atendente))].filter(Boolean);
  const podeVerTudo = isDono || permissoes.chat_todos;

  const classificarAba = (a: Atendimento): "automatico" | "aguardando" | "abertos" | "finalizados" => {
    if (a.status === "resolvido") return "finalizados";
    if (a.atendente === "BOT") return "automatico";
    // 🆕 Se já tem um atendente real atribuído (ex: vindo da roleta), vai direto pra "Abertos".
    // Antes caía em "Aguardando" porque status ainda era "pendente" — agora respeita o atendente real.
    const atendenteEhReal = !!a.atendente && !["BOT", "Humano"].includes(a.atendente);
    if (atendenteEhReal) return "abertos";
    if (a.status === "pendente") return "aguardando";
    return "abertos";
  };

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // VISIBILIDADE ESTRITA POR FILA — atendente comum só vê atendimentos das filas dele
  // ═══════════════════════════════════════════════════════════════════════
  // Antes: aba "Aguardando" / "Automático" mostrava TODOS os pendentes — atendente da
  // fila SKY via leads da fila FLIX e podia pegar (caos operacional).
  //
  // Agora: usuário em FILA1,FILA2 só vê atendimentos dessas filas em TODAS as abas.
  // Quem tem permissão "chat_todos" (dono/supervisor/grupos personalizados com flag)
  // mantém visão geral.
  //
  // Edge cases tratados:
  // - Atendimento SEM fila → todos veem (não é fluxo principal, leads recém-chegados
  //   sem classificar pelo bot; melhor ficar visível do que sumir)
  // - Usuário SEM fila configurada → vê tudo (compatibilidade com configurações antigas
  //   que não tinham campo fila preenchido — não quero quebrar workspaces existentes)
  // - Usuário com 1 fila ("FLIX") → funciona igual antes (retrocompatível com formato antigo)
  // - Usuário com N filas ("FLIX,SKY,POSPAGO") → vê atendimentos de qualquer uma das 3
  const minhasFilas = (() => {
    if (!user?.email) return [];
    const meu = usuariosWs.find(u => u.email?.toLowerCase() === user.email?.toLowerCase());
    if (!meu?.fila) return [];
    return meu.fila.split(",").map(f => f.trim()).filter(Boolean);
  })();

  // Verifica se a fila do atendimento bate com alguma fila do usuário
  const minhaFilaAtende = (filaAtendimento: string | null | undefined): boolean => {
    // Atendimento sem fila → todos veem (lead novo sem classificação ainda)
    if (!filaAtendimento) return true;
    // Usuário sem fila configurada → vê tudo (compatibilidade com configs antigas)
    if (minhasFilas.length === 0) return true;
    // Caso normal: chega aqui se atendente tem fila E atendimento tem fila
    return minhasFilas.includes(filaAtendimento);
  };

  const podeVerAtendimento = (a: Atendimento, aba: string): boolean => {
    // Quem tem chat_todos (dono/supervisor/permissão elevada) vê tudo, em qualquer aba
    if (podeVerTudo) {
      // Exceção: aba finalizados pra quem é dono/supervisor — toggle de "ver só os meus"
      if (aba === "finalizados" && !mostrarTodosFinalizados) {
        return a.atendente === user?.email;
      }
      return true;
    }

    // Atendente comum — REGRA ESTRITA POR FILA aplicada em TODAS as abas
    // (automático, aguardando, abertos, finalizados)
    if (!minhaFilaAtende(a.fila)) return false;

    // Filtros adicionais por aba
    if (aba === "abertos") {
      // Aberto = atribuído a alguém. Atendente comum só vê os DELE.
      return a.atendente === user?.email;
    }
    if (aba === "finalizados") {
      // Finalizado = só os que ele finalizou (não vê de outros, mesmo da mesma fila)
      return a.atendente === user?.email;
    }
    // Automático / Aguardando: já passou no filtro de fila, libera
    return true;
  };

  const contadoresAbas = { automatico: 0, aguardando: 0, abertos: 0, finalizados: 0 };
  atendimentos.forEach(a => {
    const aba = classificarAba(a);
    if (!podeVerAtendimento(a, aba)) return;
    // 👥 respeita o filtro de equipe (mesma regra da lista)
    if (equipeId && a.equipe_id && a.equipe_id !== equipeId) return;
    contadoresAbas[aba]++;
  });

  // 🆕 Log detalhado da busca quando ativa (DEBUG — remover depois de validar)
  if (busca.trim().length >= 3 && atendimentosComMatch !== null && atendimentosComMatch.size > 0) {
    const matchNumeros = Array.from(atendimentosComMatch).filter(k => k.startsWith("num:")).map(k => k.slice(4));
    console.log(`🔍 [Filtro] Busca "${busca}" → atendimentosComMatch=${atendimentosComMatch.size} (numeros únicos: ${matchNumeros.length})`);
    console.log(`   → Numeros que bateram: ${matchNumeros.slice(0, 5).join(", ")}${matchNumeros.length > 5 ? "..." : ""}`);
    console.log(`   → atendimentos.length=${atendimentos.length} (carregados em memória)`);
    // Verifica se algum atendimento atual tem esse número
    const candidatos = atendimentos.filter(a => matchNumeros.includes(String(a.numero)));
    console.log(`   → Candidatos na lista atendimentos: ${candidatos.length} (${candidatos.slice(0, 3).map(a => `${a.numero}(${a.nome})`).join(", ")})`);
  }

  const atendimentosFiltrados = atendimentos
    // 🆕 Quando busca tem 3+ chars, IGNORA filtro de aba (busca global em todas)
    //    Antes: user buscava "98300-9410" mas atendimento tava em "Finalizados" e
    //    o filtro de aba "Abertos" excluía → resultado 0.
    //    Agora: busca >= 3 chars vê TODAS as abas (e mostra a aba do match).
    .filter(a => busca.trim().length >= 3 || classificarAba(a) === abaConversa)
    // 🔒 BUG FIX VAZAMENTO ENTRE ATENDENTES — quando busca >= 3 chars (modo "busca global em todas as abas"),
    // usa a aba REAL do atendimento ao invés da aba selecionada. Antes a Nayara podia ver leads do
    // Thiago porque a busca passava pelo filtro com abaConversa="aguardando" (que só filtra por fila),
    // mesmo o atendimento real estando em "abertos" (que filtra por atendente específico).
    // Agora: cada atendente só vê SEUS atendimentos em abertos/finalizados, mesmo via busca.
    // Dono/supervisor (chat_todos) mantém visão geral.
    .filter(a => podeVerAtendimento(a, busca.trim().length >= 3 ? classificarAba(a) : abaConversa))
    // 🆕 BUSCA: nome OU número OU mensagem (atendimentosComMatch é Set vindo do banco)
    //    Se busca curta (<3) ou vazia: filtro padrão por nome/número
    //    Se busca >= 3: ALÉM de nome/número, considera atendimentos com match em mensagens
    .filter(a => {
      if (!busca) return true;
      const buscaLower = busca.toLowerCase();
      // Match local: nome ou número
      if (a.nome?.toLowerCase().includes(buscaLower)) return true;
      if (a.numero?.includes(busca)) return true;
      // Match em mensagens: testa por numero (preferindo match com canal_id)
      // Tabela mensagens não tem atendimento_id — relação é só por numero+canal
      if (atendimentosComMatch) {
        if (a.canal_id && atendimentosComMatch.has(`numcanal:${a.numero}:${a.canal_id}`)) return true;
        if (atendimentosComMatch.has(`num:${a.numero}`)) return true;
      }
      return false;
    })
    .filter(a => !modoCobranca || ehAtendimentoCobranca(a))
    .filter(a => filtroFila === "todas" || a.fila === filtroFila)
    .filter(a => filtroAtendente === "todos" || a.atendente === filtroAtendente)
    .filter(a => filtroCanal === "todos" || String(a.canal_id) === filtroCanal)
    // 👥 FILTRO DE EQUIPE — mostra os da equipe selecionada + os SEM equipe (pool não atribuído).
    // Esconde só os de OUTRAS equipes. Assim "Aguardando" não fica vazia.
    .filter(a => !equipeId || a.equipe_id === equipeId || !a.equipe_id)
    // 🆕 FILTRO DE TEMPO — aplicado por último pra não quebrar a lógica das abas
    .filter(a => {
      if (filtroTempo === "tudo") return true;
      const dataRef = a.updated_at || a.created_at;
      if (!dataRef) return false;
      const ts = new Date(dataRef).getTime();
      const agora = Date.now();
      if (filtroTempo === "ultima_hora") return (agora - ts) <= 60 * 60 * 1000;
      if (filtroTempo === "ultimos_15min") return (agora - ts) <= 15 * 60 * 1000;
      if (filtroTempo === "sem_resposta") {
        // Critério: visualizado_em é null E status pendente (cliente mandou, ninguém abriu ainda)
        // OU é um chat aguardando (status pendente, sem atendente humano)
        return a.status === "pendente" && (!a.visualizado_em || a.atendente === "BOT" || !a.atendente);
      }
      return true;
    });

  const temFiltroAtivo = filtroFila !== "todas" || filtroAtendente !== "todos" || filtroEtiqueta !== "todas" || filtroCanal !== "todos" || filtroTempo !== "tudo";

  const enviarMensagem = async () => {
    if (!mensagem || !atendimentoAtivo) return;
    if (!atendimentoAtivo.canal_id) { notify("Atendimento sem canal. Não é possível enviar.", "aviso"); return; }
    if (editandoMsg && editandoMsg.id) {
      setEnviandoMsg(true);
      try {
        const nomeHeader = meuNome ? `*${meuNome}*\n` : "";
        const novoTexto = nomeHeader + mensagem.trim() + " *(editado)*";
        const { error } = await supabase.from("mensagens").update({ mensagem: novoTexto }).eq("id", editandoMsg.id);
        if (error) { notify(traduzirErro(error), "erro"); }
        else {
          setHistorico(h => h.map(m => m.id === editandoMsg.id ? { ...m, mensagem: novoTexto } : m));
          notify("Mensagem editada no histórico interno.", "info", "Cliente já recebeu a original (limite da API).");
          setMensagem(""); setEditandoMsg(null);
        }
      } catch (e: any) { notify(traduzirErro(e), "erro"); }
      setEnviandoMsg(false);
      return;
    }
    setEnviandoMsg(true);
    setStickyFundo(true);
    setTemMensagemNova(false);
    try {
      const nomeHeader = meuNome ? `*${meuNome}*\n` : "";
      let mensagemFinal = nomeHeader + mensagem;
      if (respondendoMsg && respondendoMsg.mensagem) {
        const autorQuote = respondendoMsg.de === "cliente" ? (atendimentoAtivo.nome || "Cliente") : respondendoMsg.de === "bot" ? "BOT" : "Atendente";
        const trechoCru = String(respondendoMsg.mensagem).replace(/^\*[^*]+\*\n/, "").replace(/\s*\*\(editado\)\*\s*$/, "");
        const trecho = trechoCru.length > 100 ? trechoCru.slice(0, 100) + "..." : trechoCru;
        mensagemFinal = `↪️ *${autorQuote}*: "${trecho}"\n\n${nomeHeader}${mensagem}`;
      }
      const canalAtual = canais.find(c => c.id === atendimentoAtivo.canal_id);
      const tipoCanal = canalAtual?.tipo;
      let resp: any;
      if (tipoCanal === "meta" || tipoCanal === "instagram" || tipoCanal === "messenger") {
        let origem: string | undefined;
        if (tipoCanal === "instagram") origem = "instagram";
        else if (tipoCanal === "messenger") origem = "messenger";
        else if (atendimentoAtivo.origem) origem = atendimentoAtivo.origem;
        else {
          const ultimaCliente = [...historico].reverse().find(m => m.de === "cliente" && m.origem);
          if (ultimaCliente?.origem) origem = ultimaCliente.origem;
          else origem = "messenger";
        }
        const r = await fetch(`${META_BASE}/send/texto`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canalId: atendimentoAtivo.canal_id, recipientId: atendimentoAtivo.numero, texto: mensagemFinal, atendimentoId: atendimentoAtivo.id, origem: origem })
        });
        const data = await r.json();
        resp = data.sucesso ? { success: true } : { success: false, error: data.erro || "Erro no envio" };
      } else {
        resp = await wa("enviar", { numero: atendimentoAtivo.numero, mensagem: mensagemFinal, canalId: atendimentoAtivo.canal_id});
      }
      if (!resp.success) { notify(traduzirErro(resp.error || "Erro ao enviar"), "erro"); }
      else {
        setMensagem("");
        setRespondendoMsg(null);
        if (mensagemTextareaRef.current) { mensagemTextareaRef.current.style.height = "auto"; }
      }
    }
    catch { notify("Falha ao enviar mensagem. Tente novamente.", "erro"); }
    setEnviandoMsg(false);
  };

  const inserirEmoji = (emoji: string) => { setMensagem(prev => prev + emoji); };

  const emojisVisiveis = (() => {
    const cat = EMOJIS_CATEGORIAS.find(c => c.id === emojiCategoria);
    if (!cat) return [];
    if (!emojiBusca.trim()) return cat.emojis;
    return cat.emojis.filter(e => e.includes(emojiBusca));
  })();

  const handleArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const canalAtual = canais.find(c => c.id === atendimentoAtivo?.canal_id);
    const tipoCanal = canalAtual?.tipo;
    const ehCanalMeta = tipoCanal === "meta" || tipoCanal === "instagram" || tipoCanal === "messenger";
    const ehVideo = file.type.startsWith("video/");
    const ehImagem = file.type.startsWith("image/");
    const ehAudio = file.type.startsWith("audio/");
    const ehDocumento = !ehVideo && !ehImagem && !ehAudio;
    if (ehCanalMeta && ehDocumento) {
      let origemAtendimento: string | undefined;
      if (tipoCanal === "instagram") origemAtendimento = "instagram";
      else if (tipoCanal === "messenger") origemAtendimento = "messenger";
      else if (atendimentoAtivo?.origem) origemAtendimento = atendimentoAtivo.origem;
      else { const ultimaCliente = [...historico].reverse().find(m => m.de === "cliente" && m.origem); origemAtendimento = ultimaCliente?.origem; }
      if (origemAtendimento === "instagram") {
        const nomeLower = file.name.toLowerCase();
        const ehPdf = nomeLower.endsWith(".pdf") || file.type === "application/pdf";
        if (!ehPdf) {
          notify("Instagram só aceita PDF como documento.", "aviso", "Word/Excel/ZIP não podem ser enviados. Converta pra PDF, ou envie como imagem.");
          if (fileUploadRef.current) fileUploadRef.current.value = ""; return;
        }
      }
    }
    let limiteMB: number; let tipoLabel: string; let dica: string;
    if (ehCanalMeta) {
      limiteMB = 25;
      tipoLabel = ehVideo ? "vídeo" : ehImagem ? "imagem" : ehAudio ? "áudio" : "documento";
      dica = ehVideo ? "Comprima o vídeo ou envie um link no texto." : ehImagem ? "Reduza a resolução ou converta pra JPEG." : "Reduza o tamanho do arquivo.";
    } else {
      if (ehVideo) { limiteMB = 16; tipoLabel = "vídeo"; dica = "Comprima o vídeo (apps como Video Compressor) ou envie um link do YouTube/Drive."; }
      else if (ehImagem) { limiteMB = 5; tipoLabel = "imagem"; dica = "Reduza a resolução ou converta pra JPEG."; }
      else if (ehAudio) { limiteMB = 16; tipoLabel = "áudio"; dica = "Áudio muito longo? Divida em partes ou envie como documento."; }
      else { limiteMB = 100; tipoLabel = "documento"; dica = "Reduza o tamanho do arquivo ou envie pelo Google Drive."; }
    }
    if (file.size > limiteMB * 1024 * 1024) {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(1);
      notify(`${tipoLabel.charAt(0).toUpperCase() + tipoLabel.slice(1)} muito grande (${tamanhoMB} MB).`, "aviso", `Limite do WhatsApp pra ${tipoLabel}: ${limiteMB} MB. ${dica}`);
      if (fileUploadRef.current) fileUploadRef.current.value = ""; return;
    }
    setArquivoSelecionado(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) { const url = URL.createObjectURL(file); setArquivoPreviewUrl(url); }
    else { setArquivoPreviewUrl(""); }
    setLegendaArquivo("");
    if (fileUploadRef.current) fileUploadRef.current.value = "";
  };

  const cancelarEnvioArquivo = () => {
    if (arquivoPreviewUrl) URL.revokeObjectURL(arquivoPreviewUrl);
    setArquivoSelecionado(null); setArquivoPreviewUrl(""); setLegendaArquivo("");
  };

  const enviarMidia = async () => {
    if (!arquivoSelecionado || !atendimentoAtivo) return;
    if (!atendimentoAtivo.canal_id) { notify("Atendimento sem canal.", "aviso"); return; }
    setEnviandoMidia(true); setStickyFundo(true); setTemMensagemNova(false);
    try {
      const canalAtual = canais.find(c => c.id === atendimentoAtivo.canal_id);
      const tipoCanal = canalAtual?.tipo;
      const ehCanalMeta = tipoCanal === "meta" || tipoCanal === "instagram" || tipoCanal === "messenger";
      if (ehCanalMeta) {
        let origem: string | undefined;
        if (tipoCanal === "instagram") origem = "instagram";
        else if (tipoCanal === "messenger") origem = "messenger";
        else if (atendimentoAtivo.origem) origem = atendimentoAtivo.origem;
        else { const ultimaCliente = [...historico].reverse().find(m => m.de === "cliente" && m.origem); if (ultimaCliente?.origem) origem = ultimaCliente.origem; else origem = "messenger"; }
        const fd = new FormData();
        fd.append("arquivo", arquivoSelecionado);
        fd.append("recipientId", atendimentoAtivo.numero);
        fd.append("canalId", String(atendimentoAtivo.canal_id));
        fd.append("atendimentoId", String(atendimentoAtivo.id));
        fd.append("origem", origem);
        if (legendaArquivo) fd.append("legenda", legendaArquivo);
        const r = await fetch(`${META_BASE}/send/enviar-midia-arquivo`, { method: "POST", body: fd });
        const data = await r.json();
        if (!(data.success || data.sucesso)) { notify(traduzirErro(data.erro || data.error || "Erro ao enviar arquivo"), "erro"); }
        else { cancelarEnvioArquivo(); }
      } else {
        const fd = new FormData();
        fd.append("midia", arquivoSelecionado); // ⚠️ backend espera o campo "midia" (upload.single("midia"))
        fd.append("numero", atendimentoAtivo.numero);
        fd.append("canalId", String(atendimentoAtivo.canal_id));
        if (legendaArquivo) fd.append("legenda", legendaArquivo);
        // Via proxy /api/whatsapp: injeta o X-Unita-Token no servidor e evita
        // mixed content (página https chamando VPS http — o navegador bloquearia).
        const resp = await fetch(`/api/whatsapp?rota=enviar-midia`, { method: "POST", body: fd });
        const data = await resp.json();
        if (!data.success) { notify(traduzirErro(data.error || "Erro ao enviar arquivo"), "erro"); }
        else { cancelarEnvioArquivo(); }
      }
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
    setEnviandoMidia(false);
  };

  const canalAtivo = canais.find(c => c.id === atendimentoAtivo?.canal_id);
  const ehCanalWaba = canalAtivo?.tipo === "waba";

  const { janelaExpirada, horasDesdeUltimaMsgCliente } = (() => {
    if (!ehCanalWaba || historico.length === 0) { return { janelaExpirada: false, horasDesdeUltimaMsgCliente: 0 }; }
    const msgsCliente = historico.filter(m => m.de === "cliente");
    if (msgsCliente.length === 0) { return { janelaExpirada: true, horasDesdeUltimaMsgCliente: 9999 }; }
    const ultimaMsgCliente = msgsCliente[msgsCliente.length - 1];
    const tempoMs = Date.now() - new Date(ultimaMsgCliente.created_at).getTime();
    const horas = tempoMs / (1000 * 60 * 60);
    return { janelaExpirada: horas > 24, horasDesdeUltimaMsgCliente: horas };
  })();

  const abrirModalTemplate = async () => {
    if (!atendimentoAtivo?.canal_id || !wsId) return;
    setShowTemplateModal(true);
    const { data } = await supabase.from("templates_waba").select("*").eq("canal_id", atendimentoAtivo.canal_id).eq("status", "aprovado").order("created_at", { ascending: false });
    setTemplatesDoCanal(data || []);
    setTemplateEscolhido(null); setTemplateVars({});
  };

  const variaveisDoTemplate = (() => {
    if (!templateEscolhido) return [] as string[];
    const vars = new Set<string>();
    for (const comp of templateEscolhido.componentes || []) {
      if ((comp.type === "BODY" && comp.text) || (comp.type === "HEADER" && comp.format === "TEXT" && comp.text)) {
        const matches = comp.text.matchAll(/\{\{(\d+)\}\}/g);
        for (const m of matches) vars.add(m[1]);
      }
    }
    return Array.from(vars).sort((a, b) => parseInt(a) - parseInt(b));
  })();

  const enviarTemplateWaba = async () => {
    if (!templateEscolhido || !atendimentoAtivo) return;
    const faltando = variaveisDoTemplate.filter(v => !templateVars[v]?.trim());
    if (faltando.length > 0) {
      if (!confirm(`⚠️ Variáveis sem valor: ${faltando.map(v => `{{${v}}}`).join(", ")}.\n\nElas vão ser enviadas literalmente. Continuar?`)) return;
    }
    setEnviandoTemplate(true);
    try {
      const resp = await wa("enviar-template", { numero: atendimentoAtivo.numero, canalId: atendimentoAtivo.canal_id, templateId: templateEscolhido.id, variaveis: templateVars});
      if (!resp.success) { notify(traduzirErro(resp.error || "Erro ao enviar template"), "erro"); }
      else { setShowTemplateModal(false); setTemplateEscolhido(null); setTemplateVars({}); setStickyFundo(true); }
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
    setEnviandoTemplate(false);
  };

  const iniciarGravacao = async () => {
    if (!atendimentoAtivo) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      setGravando(true); setTempoGravacao(0);
      timerRef.current = setInterval(() => setTempoGravacao(t => t + 1), 1000);
    } catch (err: any) { notify("Não foi possível acessar o microfone.", "erro", "Verifique as permissões do navegador."); }
  };

  const pararStream = () => {
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const cancelarGravacao = () => {
    try { mediaRecorderRef.current?.stop(); } catch {}
    audioChunksRef.current = []; pararStream(); setGravando(false); setTempoGravacao(0);
  };

  const enviarAudioGravado = async () => {
    if (!atendimentoAtivo || !mediaRecorderRef.current) return;
    if (!atendimentoAtivo.canal_id) { notify("Atendimento sem canal. Não é possível enviar áudio.", "aviso"); return; }
    const recorder = mediaRecorderRef.current;
    setEnviandoAudio(true);
    await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); try { recorder.stop(); } catch { resolve(); } });
    pararStream(); setGravando(false);
    try {
      const canalAtual = canais.find(c => c.id === atendimentoAtivo.canal_id);
      const tipoCanal = canalAtual?.tipo;
      const ehCanalMeta = tipoCanal === "meta" || tipoCanal === "instagram" || tipoCanal === "messenger";
      if (ehCanalMeta) {
        let origem: string | undefined;
        if (tipoCanal === "instagram") origem = "instagram";
        else if (tipoCanal === "messenger") origem = "messenger";
        else if (atendimentoAtivo.origem) origem = atendimentoAtivo.origem;
        else { const ultimaCliente = [...historico].reverse().find(m => m.de === "cliente" && m.origem); origem = ultimaCliente?.origem || "messenger"; }
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        const fd = new FormData();
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: blob.type });
        fd.append("arquivo", file);
        fd.append("recipientId", atendimentoAtivo.numero);
        fd.append("canalId", String(atendimentoAtivo.canal_id));
        fd.append("atendimentoId", String(atendimentoAtivo.id));
        fd.append("origem", origem);
        const r = await fetch(`${META_BASE}/send/enviar-midia-arquivo`, { method: "POST", body: fd });
        const data = await r.json();
        if (!(data.success || data.sucesso)) { notify(traduzirErro(data.erro || data.error || "Erro ao enviar áudio"), "erro"); }
      } else {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        const form = new FormData();
        form.append("audio", blob);
        form.append("numero", atendimentoAtivo.numero);
        form.append("canalId", String(atendimentoAtivo.canal_id));
        const resp = await fetch(`/api/whatsapp?rota=enviar-audio`, { method: "POST", body: form });
        const data = await resp.json();
        if (!data.success) notify(traduzirErro(data.error || "Erro ao enviar áudio"), "erro");
      }
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
    setEnviandoAudio(false); setTempoGravacao(0);
  };

  const assumirChatDaLista = async (e: React.MouseEvent, a: Atendimento) => {
    e.stopPropagation();
    if (!user?.email) { notify("Usuário não identificado. Recarregue a página.", "aviso"); return; }
    await wa("assumir", { numero: a.numero, canalId: a.canal_id, atendenteEmail: user.email });
    await inserirMensagemSistema(a.numero, `Chat assumido por: ${meuNome}`, a.canal_id);
    await fetchAtendimentos();
  };

  const pararBotDaLista = async (e: React.MouseEvent, a: Atendimento) => {
    e.stopPropagation();
    if (!user?.email) { notify("Usuário não identificado. Recarregue a página.", "aviso"); return; }
    if (!confirm(`Parar o BOT para ${a.nome}?\n\nO BOT vai parar de responder automaticamente. Você assume o atendimento.`)) return;
    try {
      await supabase.from("atendimentos").update({ bloqueado_ia: true, bloqueado_fluxo: true, bloqueado_typebot: true }).eq("id", a.id);
      await wa("assumir", { numero: a.numero, canalId: a.canal_id, atendenteEmail: user.email });
      await inserirMensagemSistema(a.numero, `BOT interrompido. Chat assumido por: ${meuNome}`, a.canal_id);
      await fetchAtendimentos();
      setAbaConversa("abertos");
      notify("BOT parado. Você assumiu o atendimento.", "sucesso", "Vá na aba 💬 Abertos pra continuar.");
    } catch (err: any) { notify(traduzirErro(err), "erro"); }
  };

  const assumirChat = async (numero: string, canalId?: number) => {
    if (!user?.email) { notify("Usuário não identificado. Recarregue a página.", "aviso"); return; }
    await wa("assumir", { numero, canalId, atendenteEmail: user.email });
    await inserirMensagemSistema(numero, `Chat assumido por: ${meuNome}`, canalId);
    fetchAtendimentos();
    setAbaConversa("abertos");
  };
  const finalizarChat = async (numero: string, canalId?: number) => {
    if (!isDono && !permissoes.finalizar_chat && !novoPodeFinalizar && !perm.superAdmin) { notify("Você não tem permissão para finalizar atendimentos.", "erro"); return; }
    await wa("finalizar", { numero, canalId, quemFinalizou: user?.email });
    await inserirMensagemSistema(numero, `Chat finalizado por: ${meuNome}`, canalId);
    fetchAtendimentos();
    setAtendimentoAtivo(null); setHistorico([]);
  };
  const devolverBot = async (numero: string, canalId?: number) => {
    await wa("devolver", { numero, canalId});
    await inserirMensagemSistema(numero, `Chat devolvido ao BOT por: ${meuNome}`, canalId);
    fetchAtendimentos();
  };

  const pararBotIA = async () => {
    if (!atendimentoAtivo) return;
    if (!user?.email) { notify("Usuário não identificado. Recarregue a página.", "aviso"); return; }
    const ehMeu = atendimentoAtivo.atendente === user.email;
    if (!ehMeu) {
      const nomeDono = usuariosWs.find(u => u.email === atendimentoAtivo.atendente)?.nome || atendimentoAtivo.atendente;
      if (!confirm(`Esse chat foi atribuído pela roleta a ${nomeDono}.\n\nDeseja assumir mesmo assim? (${nomeDono} vai perder o lead)`)) return;
    }
    try {
      await supabase.from("atendimentos").update({ bloqueado_ia: true, bloqueado_fluxo: true, bloqueado_typebot: true, atendente: user.email, status: "aberto" }).eq("id", atendimentoAtivo.id);
      await wa("assumir", { numero: atendimentoAtivo.numero, canalId: atendimentoAtivo.canal_id, atendenteEmail: user.email });
      await inserirMensagemSistema(atendimentoAtivo.numero, `🛑 BOT/IA interrompido. Chat assumido por: ${meuNome}`, atendimentoAtivo.canal_id);
      await fetchAtendimentos();
      setAbaConversa("abertos");
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
  };
  const transferirParaFila = async (fila: string) => {
    if (!atendimentoAtivo) return;
    if (!isDono && !permissoes.transferir_chat && !novoPodeTransferir && !perm.superAdmin) { notify("Você não tem permissão para transferir conversas.", "erro"); return; }
    try {
      await supabase.from("atendimentos").update({ fila }).eq("id", atendimentoAtivo.id);
      await inserirMensagemSistema(atendimentoAtivo.numero, `Chat transferido para fila: ${fila}, por: ${meuNome}`, atendimentoAtivo.canal_id);
      await fetchAtendimentos(); setShowTransferir(false);
      notify(`Transferido para fila ${fila}.`, "sucesso");
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
  };

  const transferirParaAtendente = async (emailDestino: string, nomeDestino: string) => {
    if (!atendimentoAtivo) return;
    if (!emailDestino) { notify("Atendente sem email válido.", "aviso"); return; }
    if (!isDono && !permissoes.transferir_chat && !novoPodeTransferir && !perm.superAdmin) { notify("Você não tem permissão para transferir conversas.", "erro"); return; }
    try {
      await supabase.from("atendimentos").update({ atendente: emailDestino, status: "aberto", bloqueado_ia: true, bloqueado_fluxo: true, bloqueado_typebot: true }).eq("id", atendimentoAtivo.id);
      await inserirMensagemSistema(atendimentoAtivo.numero, `Chat transferido para: ${nomeDestino}, por: ${meuNome}`, atendimentoAtivo.canal_id);
      await fetchAtendimentos();
      setShowTransferir(false);
      notify(`Transferido para ${nomeDestino}.`, "sucesso");
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
  };

  const reabrirChat = async (a: Atendimento) => {
    if (!user?.email) { notify("Usuário não identificado. Recarregue a página.", "aviso"); return; }
    if (!confirm(`Reabrir atendimento de ${a.nome}?\n\nO chat volta para a aba "Abertos" e você passa a ser o atendente.`)) return;
    try {
      await supabase.from("atendimentos").update({ status: "aberto", atendente: user.email, bloqueado_ia: true, bloqueado_fluxo: true, bloqueado_typebot: true }).eq("id", a.id);
      await inserirMensagemSistema(a.numero, `Atendimento REABERTO por: ${meuNome}`, a.canal_id);
      await fetchAtendimentos();
      setAbaConversa("abertos");
      setAtendimentoAtivo({ ...a, status: "aberto", atendente: user.email });
      notify("Atendimento reaberto. Você é o atendente agora.", "sucesso");
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
  };

  const limparFiltros = () => { setFiltroFila("todas"); setFiltroAtendente("todos"); setFiltroEtiqueta("todas"); setFiltroCanal("todos"); setFiltroTempo("tudo"); };

  const abrirAtendimento = async (a: Atendimento) => {
    setAtendimentoAtivo(a);
    setHistorico([]);
    fetchHistorico(a.numero, a.canal_id);
    setNaoLidasPorAtendimento(prev => { const novo = { ...prev }; delete novo[a.id]; return novo; });
    if (ultimaQtdNaoLidasRef.current[a.id]) { ultimaQtdNaoLidasRef.current = { ...ultimaQtdNaoLidasRef.current, [a.id]: 0 }; }
    try {
      await supabase.from("atendimentos").update({ visualizado_em: new Date().toISOString() }).eq("id", a.id);
      setAtendimentos(prev => prev.map(x => x.id === a.id ? { ...x, visualizado_em: new Date().toISOString() } : x));
    } catch (e) { console.warn("Falha ao marcar visualizado_em (não bloqueia uso):", e); }
  };

  const tempoRelativo = (data: string) => { const d = Math.floor((Date.now() - new Date(data).getTime()) / 60000); return d < 1 ? "agora" : d < 60 ? `${d}min` : d < 1440 ? `${Math.floor(d/60)}h` : `${Math.floor(d/1440)}d`; };
  const horaMsg = (data: string) => new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataHoraMsg = (data: string) => new Date(data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const formatTempo = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const salvarCampoContato = async (campo: string, valor: any) => {
    if (!atendimentoAtivo) return;
    setSalvandoContato(true);
    try {
      const { error } = await supabase.from("atendimentos").update({ [campo]: valor }).eq("id", atendimentoAtivo.id);
      if (error) { notify(traduzirErro(error), "erro"); setSalvandoContato(false); return; }
      setAtendimentoAtivo({ ...atendimentoAtivo, [campo]: valor });
      setAtendimentos(prev => prev.map(a => a.id === atendimentoAtivo.id ? { ...a, [campo]: valor } : a));
    } catch (e: any) { notify(traduzirErro(e), "erro"); }
    setSalvandoContato(false);
  };

  const exportarPDF = () => {
    if (!atendimentoAtivo) return;
    const janela = window.open("", "_blank", "width=800,height=600");
    if (!janela) { notify("Pop-up bloqueado pelo navegador. Permita pop-ups deste site.", "aviso"); return; }
    const linhas = historico.map(m => {
      const cls = m.de === "cliente" ? "cliente" : m.de === "bot" ? "bot" : m.de === "sistema" ? "sistema" : "atendente";
      const quem = m.de === "cliente" ? "Cliente" : m.de === "bot" ? "BOT" : m.de === "sistema" ? "Sistema" : "Atendente";
      const corpo = isAudioMsg(m.mensagem) ? "🎤 [Áudio]" : (m.mensagem || "").replace(/</g, "&lt;");
      const quando = m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : "";
      return `<div class="msg ${cls}"><div>${corpo}</div><div class="meta">${quem} • ${quando}</div></div>`;
    }).join("");
    const html = `<html><head><title>Histórico ${atendimentoAtivo.nome}</title><style>body{font-family:Arial;padding:20px}h1{color:#16a34a}.msg{padding:10px;margin:5px 0;border-radius:8px;max-width:60%}.cliente{background:#e5e7eb;margin-right:auto}.atendente{background:#dbeafe;margin-left:auto;text-align:right}.bot{background:#dcfce7;margin-left:auto;text-align:right}.sistema{background:#f3f4f6;margin:10px auto;text-align:center;font-style:italic;color:#6b7280}.meta{font-size:10px;color:#6b7280}</style></head><body><h1>📄 Histórico — ${atendimentoAtivo.nome}</h1><p><b>Número:</b> ${atendimentoAtivo.numero}<br><b>Canal:</b> ${nomeDoCanal(atendimentoAtivo.canal_id)}<br><b>Fila:</b> ${atendimentoAtivo.fila || "—"}<br><b>Exportado em:</b> ${new Date().toLocaleString("pt-BR")}</p><hr>${linhas}</body></html>`;
    janela.document.write(html); janela.document.close();
    setTimeout(() => janela.print(), 500);
  };

  const numeroSanitizado = (num: string) => (num || "").replace(/\D/g, "");
  const etiquetasAplicadas = etiquetasWorkspace.filter(e => etiquetasAtendimento.includes(e.id));

  const abas = [
    { key: "automatico", label: "Automático", icon: "🤖", color: "#8b5cf6", count: contadoresAbas.automatico },
    { key: "aguardando", label: "Aguardando", icon: "⏳", color: "#f59e0b", count: contadoresAbas.aguardando },
    { key: "abertos", label: "Abertos", icon: "💬", color: "#2563eb", count: contadoresAbas.abertos },
    { key: "finalizados", label: "Finalizados", icon: "✅", color: "#16a34a", count: contadoresAbas.finalizados },
  ];

  const renderBotaoAcaoLista = (a: Atendimento) => {
    const aba = classificarAba(a);
    if (aba === "automatico") return <button onClick={(e) => pararBotDaLista(e, a)} title="Parar BOT e assumir" style={{ background: "#dc2626", color: "#1f2937", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}>⏹ Parar BOT</button>;
    if (aba === "aguardando") return <button onClick={(e) => assumirChatDaLista(e, a)} title="Assumir atendimento" style={{ background: "#f59e0b", color: "#1f2937", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}>Atender</button>;
    if (aba === "finalizados") return <button onClick={(e) => { e.stopPropagation(); reabrirChat(a); }} title="Reabrir esta conversa" style={{ background: "#f59e0b", color: "#1f2937", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}>🔓 Reabrir</button>;
    return null;
  };

  const botaoToolbar = (cor: string = "#6b7280") => ({
    background: cor === "#6b7280" ? "#f3f4f6" : `${cor}15`,
    border: cor === "#6b7280" ? "1px solid #e5e7eb" : `1px solid ${cor}30`,
    color: cor, cursor: "pointer" as const, fontSize: 15, width: 36, height: 36, padding: 0, borderRadius: 10,
    display: "flex" as const, alignItems: "center" as const, justifyContent: "center" as const, transition: "all 0.15s" as const});

  // 🛡️ Guard visual — bloqueia tela se grupo não tem acesso a atendimentos
  if (perm.carregando) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "60vh" }}>
        <p style={{ color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</p>
      </div>
    );
  }
  if (!podeAcessarChats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "60vh", padding: 32 }}>
        <div style={{ background: "white", borderRadius: 14, padding: 48, textAlign: "center", maxWidth: 460, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Sem acesso a Atendimentos</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 8px" }}>
            Teu grupo <b style={{ color: "#374151" }}>{perm.grupoNome || "(sem grupo)"}</b> não tem acesso a esta tela.
          </p>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: 0 }}>
            Peça ao admin pra ativar <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace" }}>atendimentos.acessar</code> no teu grupo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, height: "100vh" }}>
      {/* 🔔 CSS de animação da bolinha azul piscando (notificação não lida) */}
      <style>{`
        @keyframes pulseBlue {
          0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.5; transform: translateY(-50%) scale(1.4); }
        }
        @keyframes spin-icon {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* LISTA ESQUERDA — mobile: 100% largura quando nenhum chat aberto, esconde quando chat aberto */}
      <div style={{ width: isMobile ? "100%" : 340, background: tema.sidebarBg, borderRight: `1px solid ${tema.bordaSutil}`, display: isMobile && atendimentoAtivo ? "none" : "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px", background: tema.headerBg, borderBottom: `1px solid ${tema.bordaSutil}`, display: "flex", gap: 8, alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              placeholder="🔍 Buscar conversa, nome ou mensagem..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", background: "#f3f4f6", border: `1px solid ${tema.bordaSutil}`, borderRadius: 20, padding: "9px 16px", paddingRight: buscandoMsgs ? 36 : 16, color: tema.textoForte, fontSize: 13, outline: "none", transition: "all 0.15s" }}
              onFocus={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#2563eb80"; e.currentTarget.style.boxShadow = "0 0 0 3px #2563eb20"; }}
              onBlur={(e) => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.borderColor = tema.bordaSutil; e.currentTarget.style.boxShadow = "none"; }}
            />
            {/* 🆕 Spinner enquanto busca em mensagens */}
            {buscandoMsgs && (
              <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, border: `2px solid ${tema.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin-icon 0.6s linear infinite" }} />
            )}
          </div>
          {/* 🔔 Toggle de som das notificações — preferência salva no localStorage por usuário */}
          <button onClick={toggleSom} title={somAtivo ? "Som ligado (clique pra silenciar)" : "Som silenciado (clique pra ativar)"}
            style={{ width: 36, height: 36, borderRadius: 8, background: somAtivo ? "#2563eb15" : "#f3f4f6", border: somAtivo ? "1px solid #2563eb40" : "1px solid #e5e7eb", color: somAtivo ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: 15, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
            {somAtivo ? "🔔" : "🔕"}
          </button>
          {/* 🆕 Atualizar — agora com feedback visual de spin (animação CSS spin-icon) */}
          <button onClick={atualizarManual} title="Atualizar lista e mensagens" disabled={atualizando}
            style={{ width: 36, height: 36, borderRadius: 8, background: atualizando ? "#10b98115" : "#f3f4f6", border: atualizando ? "1px solid #10b98140" : "1px solid #e5e7eb", color: atualizando ? "#10b981" : "#6b7280", cursor: atualizando ? "wait" : "pointer", fontSize: 15, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
            <span style={{ display: "inline-block", animation: atualizando ? "spin-icon 0.6s linear infinite" : "none" }}>🔄</span>
          </button>
          {/* 🆕 Botão de filtros — visual tech, badge laranja se ativo */}
          <button onClick={() => setShowFiltros(!showFiltros)} title="Filtros"
            style={{ width: 36, height: 36, borderRadius: 8, background: temFiltroAtivo ? "#f59e0b15" : "#f3f4f6", border: temFiltroAtivo ? "1px solid #f59e0b40" : "1px solid #e5e7eb", color: temFiltroAtivo ? "#f59e0b" : "#6b7280", cursor: "pointer", fontSize: 15, padding: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
            🔽{temFiltroAtivo && <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, background: "#f59e0b", borderRadius: "50%", boxShadow: "0 0 0 2px #ffffff" }} />}
          </button>
        </div>

        {/* 👥 Seletor de equipe — só pra quem vê tudo (dono/supervisor) */}
        {podeVerTudo && (
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${tema.bordaSutil}`, background: tema.sidebarBg, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#a855f7", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>👥 Equipe</span>
            <div style={{ flex: 1, minWidth: 0 }}><EquipeSelector /></div>
          </div>
        )}

        {showFiltros && (
          <div style={{ background: tema.sidebarBg, borderBottom: `1px solid ${tema.bordaSutil}`, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: tema.textoFraco, fontSize: 11, fontWeight: "bold", textTransform: "uppercase" }}>Filtros</span>
              {temFiltroAtivo && <button onClick={limparFiltros} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>✕ Limpar</button>}
            </div>
            {/* 🆕 FILTRO DE TEMPO — primeira opção, mais usado */}
            <select value={filtroTempo} onChange={e => setFiltroTempo(e.target.value as any)} style={{ ...inputSm, background: ehClaro ? "#ffffff" : "#dcfce7", border: ehClaro ? `1px solid ${tema.bordaSutil}` : "none", color: tema.textoForte }}>
              <option value="tudo">⏰ Mostrar tudo (sem filtro de tempo)</option>
              <option value="sem_resposta">⚠️ Não respondidos ainda</option>
              <option value="ultima_hora">🕐 Última hora</option>
              <option value="ultimos_15min">⚡ Últimos 15 minutos</option>
            </select>
            {canais.length > 1 && (
              <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} style={{ ...inputSm, background: ehClaro ? "#ffffff" : "#dcfce7", border: ehClaro ? `1px solid ${tema.bordaSutil}` : "none", color: tema.textoForte }}>
                <option value="todos">📡 Todos os canais</option>
                {canais.map(c => <option key={c.id} value={String(c.id)}>{c.tipo === "waba" ? "🔗" : "📱"} {c.nome}</option>)}
              </select>
            )}
            <select value={filtroFila} onChange={e => setFiltroFila(e.target.value)} style={{ ...inputSm, background: ehClaro ? "#ffffff" : "#dcfce7", border: ehClaro ? `1px solid ${tema.bordaSutil}` : "none", color: tema.textoForte }}>
              <option value="todas">Todas as filas</option>
              {filas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {podeVerTudo && (
              <select value={filtroAtendente} onChange={e => setFiltroAtendente(e.target.value)} style={{ ...inputSm, background: ehClaro ? "#ffffff" : "#dcfce7", border: ehClaro ? `1px solid ${tema.bordaSutil}` : "none", color: tema.textoForte }}>
                <option value="todos">Todos os atendentes</option>
                {atendentesEmails.map(a => <option key={a} value={a}>{a === "BOT" ? "🤖 BOT" : "👤 " + nomeDoAtendente(a)}</option>)}
              </select>
            )}
            <select value={filtroEtiqueta} onChange={e => setFiltroEtiqueta(e.target.value)} style={{ ...inputSm, background: ehClaro ? "#ffffff" : "#dcfce7", border: ehClaro ? `1px solid ${tema.bordaSutil}` : "none", color: tema.textoForte }}>
              <option value="todas">Todas as etiquetas</option>
              {etiquetasWorkspace.map(et => <option key={et.id} value={et.id.toString()}>{et.icone} {et.nome}</option>)}
            </select>
          </div>
        )}

        {/* 🎨 ABAS com ícones em containers coloridos — visual tech consistente com editor de fluxos */}
        <div style={{ display: "flex", borderBottom: `1px solid ${tema.bordaSutil}`, background: "#ffffff", padding: "8px 6px", gap: 4 }}>
          {abas.map(t => {
            const ativa = abaConversa === t.key;
            const badgeLabel = t.count > 999 ? "999+" : String(t.count);
            return (
              <button key={t.key} onClick={() => setAbaConversa(t.key as any)}
                style={{ flex: 1, padding: "10px 4px 6px", background: ativa ? `${t.color}10` : "transparent", border: "none", borderRadius: 10, color: ativa ? t.color : tema.textoFraco, fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.15s", position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: ativa ? t.color : "#f3f4f6", border: ativa ? "none" : `1px solid ${t.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: ativa ? `0 4px 10px ${t.color}40` : "none", transition: "all 0.15s" }}>
                    <span style={{ filter: ativa ? "saturate(0) brightness(2)" : "none" }}>{t.icon}</span>
                  </div>
                  {t.count > 0 && (
                    <span style={{ position: "absolute", top: -6, right: -8, background: t.color, color: "#ffffff", borderRadius: 10, padding: "1px 5px", fontSize: 9, fontWeight: 700, minWidth: 14, lineHeight: 1.3, textAlign: "center", border: "2px solid #ffffff", boxShadow: `0 2px 4px ${t.color}50`, whiteSpace: "nowrap" }}>{badgeLabel}</span>
                  )}
                </div>
                <span style={{ fontSize: 10, letterSpacing: 0.2 }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {abaConversa === "finalizados" && podeVerTudo && (
          <div style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe", borderLeft: "3px solid #2563eb", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "#1e40af", fontSize: 12, fontWeight: 700, margin: 0 }}>
                {mostrarTodosFinalizados ? "👁️ Todos os finalizados" : "👤 Só os meus finalizados"}
              </p>
              <p style={{ color: "#2563eb", fontSize: 10, margin: "2px 0 0", fontWeight: 500 }}>
                {mostrarTodosFinalizados ? "Visualizando de todos os atendentes" : "Ative pra ver os de outros atendentes"}
              </p>
            </div>
            <button onClick={() => setMostrarTodosFinalizados(!mostrarTodosFinalizados)}
              style={{ width: 40, height: 22, background: mostrarTodosFinalizados ? "#16a34a" : "#d1d5db", borderRadius: 11, cursor: "pointer", border: "none", position: "relative", flexShrink: 0, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)" }}>
              <div style={{ width: 16, height: 16, background: "white", borderRadius: "50%", position: "absolute", top: 3, left: mostrarTodosFinalizados ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            </button>
          </div>
        )}

        {/* 🆕 Aba Aguardando — botão pra limpar pendentes antigos (só dono/supervisor pode) */}
        {abaConversa === "aguardando" && podeVerTudo && (() => {
          const qtde2dias = contarPendentesAntigos(2);
          if (qtde2dias === 0) return null;
          return (
            <div style={{ background: ehClaro ? "#fff8e1" : "#0d1418", borderBottom: `1px solid ${tema.bordaSutil}`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: ehClaro ? "#92400e" : "#f59e0b", fontSize: 12, fontWeight: "bold", margin: 0 }}>
                  ⚠️ {qtde2dias} pendente(s) há +2 dias
                </p>
                <p style={{ color: tema.textoFraco, fontSize: 10, margin: "2px 0 0" }}>
                  Encerra atendimentos sem interação recente
                </p>
              </div>
              <button onClick={() => setShowEncerrarAntigos(true)}
                style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b66", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap" }}>
                🧹 Limpar
              </button>
            </div>
          );
        })()}

        {/* 🆕 Badge informativa: avisa que está buscando em mensagens */}
        {busca.trim().length >= 3 && atendimentosComMatch !== null && (
          <div style={{ padding: "8px 14px", background: ehClaro ? "#dbeafe" : "#1e3a5f", borderBottom: `1px solid ${tema.bordaSutil}`, fontSize: 11, color: ehClaro ? "#1e40af" : "#93c5fd" }}>
            🔍 Busca por <b>"{busca}"</b> — {atendimentosFiltrados.length} atendimento(s) encontrado(s) em <b>todas as abas</b>
          </div>
        )}
        {busca.trim().length > 0 && busca.trim().length < 3 && (
          <div style={{ padding: "8px 14px", background: ehClaro ? "#fef3c7" : "#3a2e0a", borderBottom: `1px solid ${tema.bordaSutil}`, fontSize: 11, color: ehClaro ? "#92400e" : "#fcd34d" }}>
            💡 Digite 3+ caracteres pra buscar também nas mensagens
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, background: tema.listaItem }}>
          {atendimentosFiltrados.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p style={{ fontSize: 32, margin: "0 0 8px" }}>{abas.find(a => a.key === abaConversa)?.icon}</p>
              <p style={{ color: tema.textoFraco, fontSize: 13 }}>{temFiltroAtivo ? "Nenhum resultado para os filtros" : `Nenhum atendimento em ${abas.find(a => a.key === abaConversa)?.label.toLowerCase()}`}</p>
            </div>
          ) : atendimentosFiltrados.map(a => {
            const aba = classificarAba(a);
            const naoLidas = naoLidasPorAtendimento[a.id] || 0;
            const temNaoLidas = naoLidas > 0 && atendimentoAtivo?.id !== a.id;
            return (
              <div key={a.id} onClick={() => abrirAtendimento(a)}
                style={{ padding: "12px 14px", borderBottom: `1px solid ${tema.bordaSutil}`, cursor: "pointer", background: atendimentoAtivo?.id === a.id ? tema.listaItemSel : "transparent", position: "relative" }}>
                {temNaoLidas && (
                  <span style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", width: 6, height: 6, background: tema.accent, borderRadius: "50%", animation: "pulseBlue 1.5s ease-in-out infinite", zIndex: 1 }} />
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: ehClaro ? "#9ca3af" : "#6b7280", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#1f2937", fontWeight: "bold", fontSize: 14 }}>
                    {a.nome?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, gap: 8 }}>
                      <span style={{ color: temNaoLidas ? (ehClaro ? "#000" : "#ffffff") : tema.textoForte, fontSize: 14, fontWeight: temNaoLidas ? 700 : "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{a.nome}</span>
                      <span style={{ color: temNaoLidas ? "#00a884" : "#8696a0", fontSize: 11, fontWeight: temNaoLidas ? "bold" : "normal", flexShrink: 0 }}>{tempoRelativo(a.updated_at || a.created_at)}</span>
                    </div>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📱 {numeroSanitizado(a.numero)}{a.canal_id && <span style={{ color: "#00a884" }}> • {iconeCanal(a.canal_id, a.origem)} {nomeDoCanal(a.canal_id, a.origem)}</span>}
                    </p>
                    <p style={{ color: temNaoLidas ? tema.textoForte : tema.textoFraco, fontSize: 12, fontWeight: temNaoLidas ? "bold" : "normal", margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isAudioMsg(a.mensagem) ? "🎤 Mensagem de áudio" : a.mensagem}
                    </p>
                    {(() => {
                      const ids = etiquetasPorAtendimento[a.id] || [];
                      if (ids.length === 0) return null;
                      const etiqs = etiquetasWorkspace.filter(e => ids.includes(e.id));
                      if (etiqs.length === 0) return null;
                      return (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                          {etiqs.map(et => (
                            <span key={et.id} style={{ background: (et.cor || "#2563eb") + "22", color: et.cor || "#2563eb", fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: "bold", whiteSpace: "nowrap" }}>
                              {et.icone ? `${et.icone} ` : ""}{et.nome}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {a.fila && <span style={{ background: "#00a88422", color: "#00a884", fontSize: 10, padding: "1px 7px", borderRadius: 10 }}>{a.fila}</span>}
                        {aba === "automatico" && <span style={{ background: "#8b5cf622", color: "#8b5cf6", fontSize: 10, padding: "1px 7px", borderRadius: 10 }}>🤖 BOT</span>}
                        {aba === "aguardando" && <span style={{ background: "#f59e0b22", color: "#f59e0b", fontSize: 10, padding: "1px 7px", borderRadius: 10 }}>⏳ Aguardando</span>}
                        {(aba === "abertos" || aba === "finalizados") && a.atendente && a.atendente !== "BOT" && (
                          <>
                            <span style={{ background: "#2563eb22", color: "#2563eb", fontSize: 10, padding: "1px 7px", borderRadius: 10 }}>👤 Humano</span>
                            <span style={{ background: "#16a34a22", color: "#16a34a", fontSize: 10, padding: "1px 7px", borderRadius: 10 }}>👨‍💼 {nomeDoAtendente(a.atendente)}</span>
                          </>
                        )}
                        {temNaoLidas && (
                          <span style={{ background: "#00a884", color: "#1f2937", fontSize: 10, fontWeight: "bold", padding: "0 6px", minWidth: 18, height: 18, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {naoLidas > 99 ? "99+" : naoLidas}
                          </span>
                        )}
                      </div>
                      {renderBotaoAcaoLista(a)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ÁREA DO CHAT — mobile: esconde quando nenhum chat aberto (mostra só a lista) */}
      <div style={{ flex: 1, display: isMobile && !atendimentoAtivo ? "none" : "flex", flexDirection: "column", background: tema.chatBg, backgroundImage: WA_BG_LIGHT, backgroundRepeat: "repeat", position: "relative", width: isMobile ? "100%" : "auto" }}>
        {atendimentoAtivo ? (
          <>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.bordaSutil}`, background: tema.headerBg, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              {isMobile && (
                <button onClick={() => setAtendimentoAtivo(null)} title="Voltar para a lista"
                  style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: 24, padding: "4px 8px", marginLeft: -8, flexShrink: 0, lineHeight: 1 }}>←</button>
              )}
              <div onClick={() => setShowPainelContato(true)}
                style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0, cursor: "pointer", padding: "4px 8px", margin: "-4px -8px", borderRadius: 8, transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontWeight: "bold", fontSize: 16, boxShadow: "0 4px 10px rgba(37, 99, 235, 0.25)" }}>
                  {atendimentoAtivo.nome?.charAt(0).toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: "bold", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{atendimentoAtivo.nome}</h3>
                  <p style={{ color: "#6b7280", fontSize: 11, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {atendimentoAtivo.fila || "—"} • {atendimentoAtivo.numero}
                    {atendimentoAtivo.canal_id && canais.length > 1 && <> • {iconeCanal(atendimentoAtivo.canal_id, atendimentoAtivo.origem)} {nomeDoCanal(atendimentoAtivo.canal_id, atendimentoAtivo.origem)}</>}
                    {atendimentoAtivo.atendente && atendimentoAtivo.atendente !== "BOT" && <> • 👨‍💼 {nomeDoAtendente(atendimentoAtivo.atendente)}</>}
                  </p>
                  {atendimentoAtivo.status === "resolvido" && atendimentoAtivo.bloqueado_ate && (() => {
                    const fim = new Date(atendimentoAtivo.bloqueado_ate).getTime();
                    const agora = Date.now();
                    if (agora >= fim) return null;
                    const minutosRest = Math.ceil((fim - agora) / 60000);
                    const horas = Math.floor(minutosRest / 60);
                    const min = minutosRest % 60;
                    const tempoFmt = horas > 0 ? `${horas}h${min > 0 ? ` ${min}min` : ""}` : `${minutosRest}min`;
                    const dataLib = new Date(fim).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                    return (
                      <div style={{ marginTop: 5, background: "#dc262611", border: "1px solid #dc262633", borderRadius: 6, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                        <span style={{ color: "#dc2626", fontWeight: "bold" }}>🔒 Bloqueado por {tempoFmt}</span>
                        <span style={{ color: "#9ca3af" }}>· libera {dataLib}</span>
                      </div>
                    );
                  })()}
                  {etiquetasAplicadas.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      {etiquetasAplicadas.slice(0, 3).map(et => (
                        <span key={et.id} style={{ background: et.cor + "22", border: `1px solid ${et.cor}`, color: et.cor, fontSize: 10, padding: "1px 7px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <span>{et.icone}</span> {et.nome}
                        </span>
                      ))}
                      {etiquetasAplicadas.length > 3 && <span style={{ color: "#6b7280", fontSize: 10 }}>+{etiquetasAplicadas.length - 3}</span>}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, alignItems: "center", position: "relative", flexShrink: 0 }}>
                {permissoes.voip_usar !== false && (
                  <button onClick={() => iniciarChamada(atendimentoAtivo.numero, atendimentoAtivo.nome)} title="📞 Ligar pro lead via softphone"
                    style={{ ...botaoToolbar("#16a34a"), background: "#16a34a22", border: "1px solid #16a34a44" }}>📞</button>
                )}
                {!isMobile && (
                  <button onClick={() => setShowPainelContato(true)} title="Ver dados do contato" style={botaoToolbar()}>👁️</button>
                )}
                {!isMobile && (
                  <button onClick={() => fetchHistorico(atendimentoAtivo.numero, atendimentoAtivo.canal_id)} title="Atualizar mensagens" style={botaoToolbar()}>🔄</button>
                )}
                {atendimentoAtivo.status === "resolvido" ? (
                  <button onClick={() => reabrirChat(atendimentoAtivo)} title="Reabrir esta conversa — volta pra aba Abertos"
                    style={{ background: "#f59e0b", border: "none", color: "#1f2937", cursor: "pointer", fontSize: 12, fontWeight: "bold", padding: "8px 14px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", marginLeft: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#d97706")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#f59e0b")}>
                    🔓 Reabrir Conversa
                  </button>
                ) : (
                  <>
                    {(() => {
                      const atendenteEhEmailReal = !!atendimentoAtivo.atendente && !["BOT", "Humano"].includes(atendimentoAtivo.atendente);
                      const botAtivo = !atendimentoAtivo.bloqueado_ia && !atendimentoAtivo.bloqueado_fluxo;
                      if (atendimentoAtivo.atendente === "BOT" || (!atendenteEhEmailReal && atendimentoAtivo.status === "pendente")) {
                        return <button onClick={() => assumirChat(atendimentoAtivo.numero, atendimentoAtivo.canal_id)} title="Assumir atendimento (parar o bot)" style={botaoToolbar("#f59e0b")}>👤</button>;
                      }
                      if (atendenteEhEmailReal && botAtivo) {
                        return <button onClick={pararBotIA} title="🛑 Parar BOT/IA e assumir a conversa" style={{ ...botaoToolbar("#dc2626"), background: "#dc262622", border: "1px solid #dc262644" }}>🛑</button>;
                      }
                      return <button onClick={() => devolverBot(atendimentoAtivo.numero, atendimentoAtivo.canal_id)} title="Devolver para o BOT" style={botaoToolbar("#8b5cf6")}>🤖</button>;
                    })()}
                    {!isMobile && (isDono || permissoes.transferir_chat || novoPodeTransferir || perm.superAdmin) && (
                      <button onClick={() => setShowTransferir(!showTransferir)} title="Encaminhar para fila ou atendente"
                        style={{ ...botaoToolbar(showTransferir ? "#00a884" : "#aebac1"), background: showTransferir ? "#00a88422" : "none" }}>↗️</button>
                    )}
                    {!isMobile && (permissoes.vendas_proprio || permissoes.vendas_equipe) && atendimentoAtivo.atendente !== "BOT" && atendimentoAtivo.status !== "pendente" && (
                      <button onClick={() => window.open(`/crm/proposta?nome=${encodeURIComponent(atendimentoAtivo.nome)}&numero=${encodeURIComponent(numeroSanitizado(atendimentoAtivo.numero))}`, "_blank")}
                        title="Finalizar venda — abre a tela de proposta em nova aba"
                        style={{ background: "#16a34a", border: "none", color: "#1f2937", cursor: "pointer", fontSize: 12, fontWeight: "bold", padding: "8px 14px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", marginLeft: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#15803d")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#16a34a")}>
                        💰 Finalizar Venda
                      </button>
                    )}
                    {!isMobile && (isDono || permissoes.finalizar_chat || novoPodeFinalizar || perm.superAdmin) && (
                      <button onClick={() => { if (confirm(`Finalizar atendimento de ${atendimentoAtivo.nome}?`)) finalizarChat(atendimentoAtivo.numero, atendimentoAtivo.canal_id); }}
                        title="Finalizar atendimento" style={{ ...botaoToolbar("#dc2626"), fontSize: 18, fontWeight: "bold" }}>✓</button>
                    )}
                  </>
                )}
                {isMobile && atendimentoAtivo.status !== "resolvido" && (
                  <button onClick={() => setShowMenuMobileChat(!showMenuMobileChat)} title="Mais opções"
                    style={{ ...botaoToolbar(showMenuMobileChat ? "#00a884" : "#aebac1"), background: showMenuMobileChat ? "#00a88422" : "none", fontSize: 20, fontWeight: "bold" }}>⋮</button>
                )}
                {isMobile && showMenuMobileChat && atendimentoAtivo.status !== "resolvido" && (
                  <>
                    <div onClick={() => setShowMenuMobileChat(false)} style={{ position: "fixed", inset: 0, zIndex: 109 }} />
                    <div style={{ position: "absolute", top: 44, right: 0, background: "#f3f4f6", border: "1px solid #2a3942", borderRadius: 8, padding: 6, zIndex: 110, minWidth: 220, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                      <button onClick={() => { setShowPainelContato(true); setShowMenuMobileChat(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#1f2937", padding: "10px 14px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6 }}
                        onMouseEnter={e => e.currentTarget.style.background = "#2a3942"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <span style={{ fontSize: 16 }}>👁️</span> Ver dados do contato
                      </button>
                      <button onClick={() => { fetchHistorico(atendimentoAtivo.numero, atendimentoAtivo.canal_id); setShowMenuMobileChat(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#1f2937", padding: "10px 14px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6 }}
                        onMouseEnter={e => e.currentTarget.style.background = "#2a3942"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <span style={{ fontSize: 16 }}>🔄</span> Atualizar mensagens
                      </button>
                      {(isDono || permissoes.transferir_chat || novoPodeTransferir || perm.superAdmin) && (
                        <button onClick={() => { setShowTransferir(true); setShowMenuMobileChat(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#1f2937", padding: "10px 14px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6 }}
                          onMouseEnter={e => e.currentTarget.style.background = "#2a3942"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                          <span style={{ fontSize: 16 }}>↗️</span> Encaminhar
                        </button>
                      )}
                      {(permissoes.vendas_proprio || permissoes.vendas_equipe) && atendimentoAtivo.atendente !== "BOT" && atendimentoAtivo.status !== "pendente" && (
                        <button onClick={() => { window.open(`/crm/proposta?nome=${encodeURIComponent(atendimentoAtivo.nome)}&numero=${encodeURIComponent(numeroSanitizado(atendimentoAtivo.numero))}`, "_blank"); setShowMenuMobileChat(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "#16a34a22", border: "none", color: "#16a34a", padding: "10px 14px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6, fontWeight: "bold", marginTop: 4 }}
                          onMouseEnter={e => e.currentTarget.style.background = "#16a34a44"} onMouseLeave={e => e.currentTarget.style.background = "#16a34a22"}>
                          <span style={{ fontSize: 16 }}>💰</span> Finalizar Venda
                        </button>
                      )}
                      {(isDono || permissoes.finalizar_chat || novoPodeFinalizar || perm.superAdmin) && (
                        <button onClick={() => { if (confirm(`Finalizar atendimento de ${atendimentoAtivo.nome}?`)) { finalizarChat(atendimentoAtivo.numero, atendimentoAtivo.canal_id); setShowMenuMobileChat(false); } }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#dc2626", padding: "10px 14px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6, fontWeight: "bold", marginTop: 4, borderTop: "1px solid #2a3942" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#dc262622"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                          <span style={{ fontSize: 16 }}>✓</span> Finalizar atendimento
                        </button>
                      )}
                    </div>
                  </>
                )}
                {showTransferir && (
                  <div style={{ position: "absolute", top: 44, right: 0, background: "#f3f4f6", border: "1px solid #2a3942", borderRadius: 8, padding: 12, zIndex: 110, width: 260, maxHeight: 440, overflowY: "auto" }}>
                    <p style={{ color: "#00a884", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", margin: "0 0 8px", letterSpacing: 0.5 }}>📋 Encaminhar para fila</p>
                    {filas.length === 0 ? (
                      <p style={{ color: "#6b7280", fontSize: 11, fontStyle: "italic", margin: "0 0 10px" }}>Nenhuma fila cadastrada.</p>
                    ) : (
                      filas.map(f => (
                        <button key={"fila-" + f} onClick={() => transferirParaFila(f)}
                          style={{ display: "block", width: "100%", background: "#ffffff", border: "1px solid #2a3942", borderRadius: 6, padding: "8px 12px", color: "#1f2937", fontSize: 12, cursor: "pointer", textAlign: "left", marginBottom: 4 }}>📋 {f}</button>
                      ))
                    )}
                    <div style={{ height: 1, background: "#f3f4f6", margin: "12px 0" }} />
                    <p style={{ color: "#f59e0b", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", margin: "0 0 8px", letterSpacing: 0.5 }}>👥 Encaminhar para atendente</p>
                    {(() => {
                      const outrosAtendentes = usuariosWs.filter(u => u.email && u.email.toLowerCase() !== user?.email?.toLowerCase());
                      if (outrosAtendentes.length === 0) { return <p style={{ color: "#6b7280", fontSize: 11, fontStyle: "italic", margin: "0 0 8px" }}>Nenhum outro atendente cadastrado.</p>; }
                      return outrosAtendentes.map((u, idx) => (
                        <button key={"user-" + u.email + idx} onClick={() => transferirParaAtendente(u.email, u.nome || u.email.split("@")[0])}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "#ffffff", border: "1px solid #2a3942", borderRadius: 6, padding: "8px 12px", color: "#1f2937", fontSize: 12, cursor: "pointer", textAlign: "left", marginBottom: 4 }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59e0b33", color: "#f59e0b", fontWeight: "bold", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {(u.nome || u.email).charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: "#1f2937", fontSize: 12, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nome || u.email.split("@")[0]}</p>
                            <p style={{ color: "#6b7280", fontSize: 9, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                          </div>
                        </button>
                      ));
                    })()}
                    <button onClick={() => setShowTransferir(false)} style={{ background: "none", color: "#6b7280", border: "none", padding: "6px", fontSize: 11, cursor: "pointer", width: "100%", marginTop: 6 }}>Cancelar</button>
                  </div>
                )}
              </div>
            </div>

            <div ref={scrollContainerRef} onScroll={onScrollChat} style={{ flex: 1, overflowY: "auto", padding: "16px 8%", display: "flex", flexDirection: "column", gap: 6 }}>
              {historico.length === 0
                ? <div style={{ textAlign: "center", padding: 40 }}><p style={{ color: "#6b7280", fontSize: 13 }}>Nenhuma mensagem ainda</p></div>
                : historico.map((msg, i) => {
                    if (msg.de === "sistema") {
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                          <div style={{ background: "#f9fafb", color: "#6b7280", fontSize: 11, padding: "6px 14px", borderRadius: 10, maxWidth: "80%", textAlign: "center", fontStyle: "italic" }}>
                            {msg.mensagem}
                            {msg.created_at && <div style={{ fontSize: 9, color: "#667781", marginTop: 2 }}>{dataHoraMsg(msg.created_at)}</div>}
                          </div>
                        </div>
                      );
                    }
                    const isCliente = msg.de === "cliente"; const isBot = msg.de === "bot";
                    const ehAudio = isAudioMsg(msg.mensagem);
                    const midia = parseMidia(msg.mensagem);
                    const ehMidia = midia.tipo !== null;
                    const maxWidth = ehAudio ? 340 : midia.tipo === "img" || midia.tipo === "video" ? 320 : midia.tipo === "file" ? 300 : "65%";
                    let quoteAutor: string | null = null;
                    let quoteTexto: string | null = null;
                    let msgTextoLimpo: string = msg.mensagem;
                    if (!ehAudio && !ehMidia && typeof msg.mensagem === "string") {
                      const m = msg.mensagem.match(/^↪️ \*([^*]+)\*: "([\s\S]+?)"\n\n([\s\S]*)$/);
                      if (m) { quoteAutor = m[1]; quoteTexto = m[2]; msgTextoLimpo = m[3]; }
                    }
                    const foiEditada = typeof msgTextoLimpo === "string" && /\*\(editado\)\*\s*$/.test(msgTextoLimpo);
                    if (foiEditada) msgTextoLimpo = msgTextoLimpo.replace(/\s*\*\(editado\)\*\s*$/, "");
                    return (
                      <div key={i} onMouseEnter={() => setHoverMsgIdx(i)} onMouseLeave={() => { setHoverMsgIdx(prev => prev === i ? null : prev); }}
                        style={{ display: "flex", justifyContent: isCliente ? "flex-start" : "flex-end", position: "relative" }}>
                        <div style={{ maxWidth, padding: ehMidia ? "4px 4px 6px" : "6px 10px 8px", borderRadius: isCliente ? "8px 8px 8px 2px" : "8px 8px 2px 8px", background: isCliente ? "#dcfce7" : "#dbeafe", boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)", position: "relative" }}>
                          {!isCliente && !ehAudio && !ehMidia && <p style={{ color: "#8edfc3", fontSize: 10, margin: "0 0 2px", fontWeight: "bold" }}>{isBot ? "🤖 BOT" : "👤 Você"}</p>}
                          {quoteAutor && quoteTexto && (
                            <div style={{ background: isCliente ? "#1e2a30" : "#01493b", borderLeft: "3px solid #00a884", padding: "6px 8px", borderRadius: 4, marginBottom: 6 }}>
                              <p style={{ fontSize: 11, fontWeight: "bold", color: "#00d9a3", margin: 0 }}>{quoteAutor}</p>
                              <p style={{ fontSize: 12, color: "#a3b8c2", margin: "2px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 60, overflow: "hidden" }}>{quoteTexto}</p>
                            </div>
                          )}
                          {hoverMsgIdx === i && !ehAudio && (
                            <button onClick={(e) => { e.stopPropagation(); setMenuMsgIdx(menuMsgIdx === i ? null : i); }} title="Opções da mensagem"
                              style={{ position: "absolute", top: 4, right: 4, background: isCliente ? "rgba(220, 252, 231, 0.95)" : "rgba(219, 234, 254, 0.95)", color: "#374151", border: "none", borderRadius: "50%", width: 24, height: 24, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", transition: "all 0.15s", paddingTop: 2 } as any}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.18)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.12)"; }}>⌄</button>
                          )}
                          {menuMsgIdx === i && (
                            <div onMouseLeave={() => setMenuMsgIdx(null)}
                              style={{ position: "absolute", top: 30, right: 4, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 10px 25px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.06)", zIndex: 100, overflow: "hidden", minWidth: 170, padding: 4 } as any}>
                              <button onClick={() => marcarParaResponder(msg)}
                                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#1f2937", padding: "9px 12px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6, fontWeight: 500 }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                                <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>↪️</span> Responder
                              </button>
                              {podeEditarMsg(msg) && (
                                <button onClick={() => marcarParaEditar(msg)}
                                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#1f2937", padding: "9px 12px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6, fontWeight: 500 }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                                  <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>✏️</span> Editar
                                </button>
                              )}
                              <button onClick={() => { navigator.clipboard.writeText(msgTextoLimpo || ""); setMenuMsgIdx(null); notify("Mensagem copiada.", "sucesso"); }}
                                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#1f2937", padding: "9px 12px", fontSize: 13, cursor: "pointer", textAlign: "left", borderRadius: 6, fontWeight: 500 }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                                <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>📋</span> Copiar
                              </button>
                            </div>
                          )}
                          {ehAudio && <AudioPlayer src={urlMidiaFinal(audioFilename(msg.mensagem), msg.canal_id)} isOwn={!isCliente} />}
                          {midia.tipo === "img" && (
                            <div>
                              <a href={urlMidiaFinal(midia.filename, msg.canal_id)} target="_blank" rel="noreferrer">
                                <img src={urlMidiaFinal(midia.filename, msg.canal_id)} alt="imagem" style={{ display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 6, cursor: "pointer", objectFit: "cover" }} />
                              </a>
                              {midia.legenda && <p style={{ color: "#1f2937", fontSize: 13.5, margin: "6px 6px 0", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{midia.legenda}</p>}
                            </div>
                          )}
                          {midia.tipo === "video" && (
                            <div>
                              <video src={urlMidiaFinal(midia.filename, msg.canal_id)} controls preload="metadata" style={{ display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 6 }} />
                              {midia.legenda && <p style={{ color: "#1f2937", fontSize: 13.5, margin: "6px 6px 0", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{midia.legenda}</p>}
                            </div>
                          )}
                          {midia.tipo === "file" && (
                            <div>
                              <a href={urlMidiaFinal(midia.filename, msg.canal_id)} target="_blank" rel="noreferrer" download
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: isCliente ? "#1f2a31" : "#00604f", borderRadius: 6, textDecoration: "none" }}>
                                <span style={{ fontSize: 32 }}>{iconePorExtensao(midia.filename.split("?")[0])}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ color: "#1f2937", fontSize: 13, fontWeight: "bold", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(midia.filename.split("/").pop() || "arquivo").split("?")[0].replace(/^midia_\d+_[a-z0-9]+_/, "").replace(/^\d+_\d+_\d+\./, "arquivo.")}</p>
                                  <p style={{ color: isCliente ? "#8696a0" : "#a3e4d0", fontSize: 11, margin: "2px 0 0" }}>{(midia.filename.split("?")[0].split(".").pop() || "arquivo").toUpperCase()} · clique p/ baixar</p>
                                </div>
                              </a>
                              {midia.legenda && <p style={{ color: "#1f2937", fontSize: 13.5, margin: "6px 6px 0", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{midia.legenda}</p>}
                            </div>
                          )}
                          {!ehAudio && !ehMidia && (
                            <p style={{ color: "#1f2937", fontSize: 13.5, margin: 0, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msgTextoLimpo}</p>
                          )}
                          {msg.created_at && (
                            <p style={{ color: isCliente ? "#8696a0" : "#a3e4d0", fontSize: 10, margin: "2px 6px 0 0", textAlign: "right" }}>
                              {foiEditada && <span style={{ fontStyle: "italic", marginRight: 6, opacity: 0.85 }}>editada</span>}
                              {horaMsg(msg.created_at)}{!isCliente && " ✓✓"}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              <div ref={chatBottomRef} />
            </div>

            {!stickyFundo && (
              <button onClick={irParaFundo} title={temMensagemNova ? "Nova mensagem recebida — clique pra ver" : "Ir para a última mensagem"}
                style={{ position: "absolute", right: 20, bottom: 90, width: 42, height: 42, borderRadius: "50%", background: temMensagemNova ? "#00a884" : "#2a3942", border: "1px solid " + (temMensagemNova ? "#00a884" : "#3b4a54"), color: "#1f2937", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.4)", zIndex: 10, fontWeight: "bold" }}>
                ↓
                {temMensagemNova && <span style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, background: "#dc2626", borderRadius: "50%", border: "2px solid #ffffff" }} />}
              </button>
            )}

            {(respondendoMsg || editandoMsg) && !gravando && (
              <div style={{ background: "#dcfce7", borderTop: "1px solid #2a3942", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{editandoMsg ? "✏️" : "↪️"}</span>
                <div style={{ flex: 1, borderLeft: "3px solid #00a884", paddingLeft: 10, minWidth: 0 }}>
                  <p style={{ color: "#00d9a3", fontSize: 11, fontWeight: "bold", margin: 0 }}>
                    {editandoMsg ? "Editando sua mensagem" : `Respondendo a ${(respondendoMsg?.de === "cliente" ? (atendimentoAtivo?.nome || "Cliente") : respondendoMsg?.de === "bot" ? "BOT" : "Atendente")}`}
                  </p>
                  <p style={{ color: "#4b5563", fontSize: 12, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(() => { const m = editandoMsg || respondendoMsg; if (!m) return ""; const t = String(m.mensagem || "").replace(/^↪️ \*[^*]+\*: "[\s\S]+?"\n\n/, "").replace(/^\*[^*]+\*\n/, "").replace(/\s*\*\(editado\)\*\s*$/, ""); return t.length > 80 ? t.slice(0, 80) + "..." : t; })()}
                  </p>
                  {editandoMsg && <p style={{ color: "#fbbf24", fontSize: 10, margin: "3px 0 0", fontStyle: "italic" }}>⚠️ Edição apenas no histórico interno — cliente já recebeu a versão original.</p>}
                </div>
                <button onClick={cancelarRespostaOuEdicao} title="Cancelar" style={{ background: "none", color: "#6b7280", border: "none", fontSize: 22, cursor: "pointer", padding: "4px 8px", lineHeight: 1, fontWeight: "bold" }}>×</button>
              </div>
            )}

            {showRespostas && permissoes.respostas_rapidas && !gravando && (
              <div style={{ background: "#dcfce7", borderTop: "1px solid #2a3942", padding: 10, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {respostasRapidas.map((r, i) => (
                  <button key={i} onClick={() => { setMensagem(r.mensagem); setShowRespostas(false); }}
                    style={{ background: "#ffffff", border: "1px solid #2a3942", borderRadius: 8, padding: "8px 12px", color: "#1f2937", fontSize: 12, cursor: "pointer", textAlign: "left", display: "flex", gap: 10 }}>
                    <span style={{ color: "#00a884", fontWeight: "bold", minWidth: 60 }}>{r.atalho}</span>
                    <span style={{ color: "#4b5563" }}>{r.mensagem}</span>
                  </button>
                ))}
              </div>
            )}

            {gravando ? (
              <div style={{ background: "#dcfce7", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                <button onClick={cancelarGravacao} disabled={enviandoAudio} title="Cancelar gravação"
                  style={{ background: "#dc2626", color: "#1f2937", border: "none", borderRadius: "50%", width: 42, height: 42, fontSize: 18, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#f3f4f6", borderRadius: 20, padding: "10px 18px" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", animation: "pulse 1s infinite" }} />
                  <span style={{ color: "#1f2937", fontSize: 14, fontWeight: "bold" }}>Gravando...</span>
                  <span style={{ color: "#6b7280", fontSize: 13, fontFamily: "monospace", marginLeft: "auto" }}>{formatTempo(tempoGravacao)}</span>
                </div>
                <button onClick={enviarAudioGravado} disabled={enviandoAudio} title="Enviar áudio"
                  style={{ background: enviandoAudio ? "#047857" : "#00a884", color: "#1f2937", border: "none", borderRadius: "50%", width: 42, height: 42, fontSize: 18, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}>{enviandoAudio ? "…" : "➤"}</button>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
              </div>
            ) : (
              <>
                {ehCanalWaba && janelaExpirada && (
                  <div style={{ background: "#f59e0b22", borderTop: "1px solid #f59e0b66", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#fbbf24", fontSize: 12, margin: 0, fontWeight: "bold" }}>Janela de 24h expirada</p>
                      <p style={{ color: "#fde68a", fontSize: 11, margin: "2px 0 0" }}>
                        {horasDesdeUltimaMsgCliente > 9000 ? "Esse contato nunca te enviou mensagem." : `Última mensagem do cliente há ${Math.floor(horasDesdeUltimaMsgCliente)}h.`} Só é possível enviar via Template aprovado.
                      </p>
                    </div>
                    <button onClick={abrirModalTemplate} style={{ background: "#f59e0b", color: "#1f2937", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}>📋 Enviar Template</button>
                  </div>
                )}
                {showEmojiPicker && (
                  <div style={{ background: "#dcfce7", borderTop: "1px solid #2a3942", maxHeight: 320, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #2a3942", padding: "6px 8px", overflowX: "auto" }}>
                      {EMOJIS_CATEGORIAS.map(cat => (
                        <button key={cat.id} onClick={() => setEmojiCategoria(cat.id)} title={cat.label}
                          style={{ background: emojiCategoria === cat.id ? "#00a88433" : "transparent", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 18, cursor: "pointer", flexShrink: 0, borderBottom: emojiCategoria === cat.id ? "2px solid #00a884" : "2px solid transparent" }}>
                          {cat.icone}
                        </button>
                      ))}
                      <input placeholder="🔍 Buscar..." value={emojiBusca} onChange={e => setEmojiBusca(e.target.value)}
                        style={{ flex: 1, minWidth: 100, background: "#ffffff", border: "1px solid #2a3942", borderRadius: 6, padding: "4px 10px", color: "#1f2937", fontSize: 12, marginLeft: 8 }} />
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))", gap: 2 }}>
                      {emojisVisiveis.length === 0 ? (
                        <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", fontSize: 12, padding: 20 }}>Nenhum emoji encontrado</div>
                      ) : emojisVisiveis.map((emoji, i) => (
                        <button key={`${emojiCategoria}-${i}`} onClick={() => inserirEmoji(emoji)}
                          style={{ background: "none", border: "none", fontSize: 22, padding: 4, cursor: "pointer", borderRadius: 4, lineHeight: 1 }}
                          onMouseEnter={e => e.currentTarget.style.background = "#2a3942"} onMouseLeave={e => e.currentTarget.style.background = "none"}>{emoji}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ background: "#dcfce7", padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                  {permissoes.respostas_rapidas && (
                    <button onClick={() => setShowRespostas(!showRespostas)} title="Respostas rápidas"
                      style={{ background: showRespostas ? "#00a88422" : "none", color: showRespostas ? "#00a884" : "#8696a0", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer" }}>⚡</button>
                  )}
                  <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji"
                    style={{ background: showEmojiPicker ? "#00a88422" : "none", color: showEmojiPicker ? "#00a884" : "#8696a0", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 20, cursor: "pointer" }}>😊</button>
                  <input ref={fileUploadRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar" onChange={handleArquivoSelecionado} style={{ display: "none" }} />
                  <button onClick={() => fileUploadRef.current?.click()} title="Anexar arquivo"
                    style={{ background: "none", color: "#6b7280", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer" }}>📎</button>
                  {ehCanalWaba && (
                    <button onClick={abrirModalTemplate} title={janelaExpirada ? "Enviar template (janela 24h expirada)" : "Enviar template aprovado"}
                      style={{ background: janelaExpirada ? "#f59e0b" : "none", color: janelaExpirada ? "white" : "#8696a0", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer", animation: janelaExpirada ? "pulse 2s infinite" : "none" }}>📋</button>
                  )}
                  <textarea ref={mensagemTextareaRef} placeholder={isMobile ? "Mensagem" : (meuNome ? `Mensagem (vai com *${meuNome}* no topo)` : "Mensagem")} value={mensagem}
                    onChange={e => {
                      setMensagem(e.target.value);
                      if (e.target.value === "/" && permissoes.respostas_rapidas) setShowRespostas(true);
                      else if (!e.target.value) setShowRespostas(false);
                      const ta = e.target; ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
                    }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } }}
                    onFocus={() => setShowEmojiPicker(false)} rows={1}
                    style={{ flex: 1, background: "#f3f4f6", border: "none", borderRadius: 20, padding: "10px 16px", color: "#1f2937", fontSize: 14, resize: "none", fontFamily: "inherit", lineHeight: "1.4", maxHeight: 140, overflowY: "auto" }} />
                  {mensagem ? (
                    <button onClick={enviarMensagem} disabled={enviandoMsg} title="Enviar"
                      style={{ background: "#00a884", color: "#1f2937", border: "none", borderRadius: "50%", width: 42, height: 42, fontSize: 18, cursor: "pointer", fontWeight: "bold" }}>{enviandoMsg ? "…" : "➤"}</button>
                  ) : (
                    <button onClick={iniciarGravacao} title="Gravar áudio"
                      style={{ background: "none", color: "#6b7280", border: "none", borderRadius: "50%", width: 42, height: 42, fontSize: 18, cursor: "pointer" }}>🎤</button>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18, background: "transparent" }}>
            <div style={{ width: 96, height: 96, borderRadius: 24, background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, boxShadow: "0 12px 24px rgba(37, 99, 235, 0.25), 0 4px 8px rgba(37, 99, 235, 0.15)" }}>
              <span style={{ filter: "saturate(0) brightness(2)" }}>💬</span>
            </div>
            <h2 style={{ color: "#1f2937", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Unita Chatbot</h2>
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0, maxWidth: 400, textAlign: "center", lineHeight: 1.5 }}>Selecione uma conversa à esquerda pra começar a atender</p>
            {meuNome && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#22c55e15", border: "1px solid #22c55e40", borderRadius: 20 }}>
                <span style={{ fontSize: 13 }}>👋</span>
                <span style={{ color: "#15803d", fontSize: 12, fontWeight: 600 }}>Olá, {meuNome}!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🆕 MODAL PREVIEW DE ARQUIVO — aparece antes de enviar pra user ver preview + adicionar legenda */}
      {arquivoSelecionado && (
        <div onClick={() => !enviandoMidia && cancelarEnvioArquivo()}
          style={{ position: "fixed", inset: 0, background: "#000e", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid #2a3942", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a3942", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: "bold", margin: 0 }}>📎 Enviar arquivo</h3>
              <button onClick={cancelarEnvioArquivo} disabled={enviandoMidia}
                style={{ background: "none", border: "none", color: "#6b7280", fontSize: 22, cursor: enviandoMidia ? "not-allowed" : "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "#f8fafc" }}>
              {arquivoPreviewUrl && arquivoSelecionado.type.startsWith("image/") ? (
                <img src={arquivoPreviewUrl} alt="preview" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, objectFit: "contain" }} />
              ) : arquivoPreviewUrl && arquivoSelecionado.type.startsWith("video/") ? (
                <video src={arquivoPreviewUrl} controls style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
              ) : (
                <div style={{ background: "#f3f4f6", borderRadius: 8, padding: 30, textAlign: "center", width: "100%" }}>
                  <p style={{ fontSize: 56, margin: 0 }}>
                    {arquivoSelecionado.type.startsWith("audio/") ? "🎵"
                      : arquivoSelecionado.name.match(/\.pdf$/i) ? "📕"
                      : arquivoSelecionado.name.match(/\.(xlsx?|csv)$/i) ? "📊"
                      : arquivoSelecionado.name.match(/\.(docx?|rtf)$/i) ? "📄"
                      : arquivoSelecionado.name.match(/\.(pptx?)$/i) ? "📽️"
                      : arquivoSelecionado.name.match(/\.(zip|rar|7z)$/i) ? "🗜️"
                      : "📎"}
                  </p>
                </div>
              )}
              <div style={{ textAlign: "center", color: "#1f2937" }}>
                <p style={{ fontSize: 14, fontWeight: "bold", margin: "0 0 2px", wordBreak: "break-all" }}>{arquivoSelecionado.name}</p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
                  {(arquivoSelecionado.size / 1024 / 1024).toFixed(2)} MB · {arquivoSelecionado.type || "tipo desconhecido"}
                </p>
              </div>
            </div>
            <div style={{ padding: "12px 16px", background: "#dcfce7", display: "flex", gap: 8, alignItems: "center" }}>
              <textarea
                placeholder="Adicione uma legenda (opcional)"
                value={legendaArquivo}
                onChange={e => {
                  setLegendaArquivo(e.target.value);
                  const ta = e.target; ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !enviandoMidia) { e.preventDefault(); enviarMidia(); } }}
                disabled={enviandoMidia}
                rows={1}
                style={{ flex: 1, background: "#f3f4f6", border: "none", borderRadius: 20, padding: "10px 16px", color: "#1f2937", fontSize: 14, resize: "none", fontFamily: "inherit", lineHeight: "1.4", maxHeight: 100, overflowY: "auto" }}
              />
              <button onClick={enviarMidia} disabled={enviandoMidia}
                style={{ background: enviandoMidia ? "#047857" : "#00a884", color: "#1f2937", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 18, cursor: enviandoMidia ? "not-allowed" : "pointer", fontWeight: "bold" }}>
                {enviandoMidia ? "…" : "➤"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 MODAL TEMPLATE WABA — escolher template aprovado + preencher variáveis + enviar */}
      {showTemplateModal && atendimentoAtivo && (
        <div onClick={() => !enviandoTemplate && setShowTemplateModal(false)}
          style={{ position: "fixed", inset: 0, background: "#000e", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#ffffff", borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid #2a3942", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a3942", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: "bold", margin: 0 }}>📋 Enviar Template WABA</h3>
              <button onClick={() => setShowTemplateModal(false)} disabled={enviandoTemplate}
                style={{ background: "none", border: "none", color: "#6b7280", fontSize: 22, cursor: enviandoTemplate ? "not-allowed" : "pointer" }}>✕</button>
            </div>
            {janelaExpirada && (
              <div style={{ padding: "10px 20px", background: "#f59e0b22", borderBottom: "1px solid #f59e0b44" }}>
                <p style={{ color: "#fbbf24", fontSize: 12, margin: 0 }}>
                  ⚠️ Janela de 24h expirada. O template vai reabrir a conversa (custo da Meta aplica).
                </p>
              </div>
            )}
            <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: "bold" }}>
                  Template aprovado ({templatesDoCanal.length} disponíveis)
                </label>
                {templatesDoCanal.length === 0 ? (
                  <div style={{ background: "#dcfce7", borderRadius: 8, padding: 16, textAlign: "center" }}>
                    <p style={{ color: "#f59e0b", fontSize: 13, margin: "0 0 8px" }}>⚠️ Nenhum template aprovado pra esse canal</p>
                    <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>
                      Cria templates em <b>Chatbot → Templates</b> e aguarda aprovação da Meta.
                    </p>
                  </div>
                ) : (
                  <select value={templateEscolhido?.id || ""}
                    onChange={e => { const t = templatesDoCanal.find(tpl => tpl.id === parseInt(e.target.value)); setTemplateEscolhido(t || null); setTemplateVars({}); }}
                    style={{ width: "100%", background: "#f3f4f6", border: "1px solid #374045", borderRadius: 8, padding: "10px 12px", color: "#1f2937", fontSize: 13 }}>
                    <option value="">— Selecione um template —</option>
                    {templatesDoCanal.map(t => (
                      <option key={t.id} value={t.id}>✅ {t.nome_amigavel || t.meta_template_name} ({t.categoria}, {t.idioma})</option>
                    ))}
                  </select>
                )}
              </div>
              {templateEscolhido && (
                <div style={{ background: "#dcfce7", borderRadius: 10, padding: 14 }}>
                  <p style={{ color: "#6b7280", fontSize: 10, fontWeight: "bold", textTransform: "uppercase", margin: "0 0 8px" }}>Preview</p>
                  {(templateEscolhido.componentes || []).map((c: any, i: number) => {
                    if (c.type === "HEADER" && c.format === "TEXT") return <p key={i} style={{ color: "#86efac", fontSize: 12, margin: "0 0 6px", fontWeight: "bold" }}>📌 {c.text}</p>;
                    if (c.type === "HEADER") return <p key={i} style={{ color: "#6b7280", fontSize: 11, margin: "0 0 6px" }}>📎 {c.format}</p>;
                    if (c.type === "BODY") return <p key={i} style={{ color: "#1f2937", fontSize: 13, margin: "0 0 6px", whiteSpace: "pre-wrap" }}>{c.text}</p>;
                    if (c.type === "FOOTER") return <p key={i} style={{ color: "#6b7280", fontSize: 11, margin: "0 0 6px", fontStyle: "italic" }}>{c.text}</p>;
                    if (c.type === "BUTTONS") return <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {(c.buttons || []).map((b: any, j: number) => (
                        <span key={j} style={{ background: "#00a88422", color: "#00a884", fontSize: 11, padding: "3px 10px", borderRadius: 6 }}>{b.text}</span>
                      ))}
                    </div>;
                    return null;
                  })}
                </div>
              )}
              {templateEscolhido && variaveisDoTemplate.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", fontWeight: "bold" }}>
                    🔧 Variáveis ({variaveisDoTemplate.length})
                  </label>
                  {variaveisDoTemplate.map(v => (
                    <div key={v}>
                      <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 2 }}>{`{{${v}}}`}</label>
                      <input value={templateVars[v] || ""} onChange={e => setTemplateVars(p => ({ ...p, [v]: e.target.value }))}
                        placeholder={`Valor pra {{${v}}}`}
                        style={{ width: "100%", background: "#f3f4f6", border: "1px solid #374045", borderRadius: 8, padding: "8px 12px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #2a3942", background: "#dcfce7", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>
                Para: <b style={{ color: "#00a884", fontFamily: "monospace" }}>{atendimentoAtivo.numero}</b>
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowTemplateModal(false)} disabled={enviandoTemplate}
                  style={{ background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: enviandoTemplate ? "not-allowed" : "pointer" }}>Cancelar</button>
                <button onClick={enviarTemplateWaba} disabled={enviandoTemplate || !templateEscolhido}
                  style={{ background: (enviandoTemplate || !templateEscolhido) ? "#047857" : "#00a884", color: "#1f2937", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, cursor: (enviandoTemplate || !templateEscolhido) ? "not-allowed" : "pointer", fontWeight: "bold" }}>
                  {enviandoTemplate ? "⏳ Enviando..." : "🚀 Enviar Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DADOS DO CONTATO — mobile: fullscreen overlay; desktop: sidebar 340px */}
      {atendimentoAtivo && showPainelContato && (
        <div style={{ width: isMobile ? "100%" : 340, background: "#ffffff", borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden", position: isMobile ? "fixed" : "relative", top: isMobile ? 0 : "auto", left: isMobile ? 0 : "auto", right: isMobile ? 0 : "auto", bottom: isMobile ? 0 : "auto", zIndex: isMobile ? 100 : "auto", height: isMobile ? "100vh" : "auto" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div>
              <h3 style={{ color: "#ffffff", fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: 0.2 }}>👤 Dados do Contato</h3>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, margin: "3px 0 0", fontWeight: 500 }}>{salvandoContato ? "💾 Salvando..." : "Auto-salvo"}</p>
            </div>
            <button onClick={() => setShowPainelContato(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#ffffff", fontSize: 14, cursor: "pointer", width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"} onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}>✕</button>
          </div>

          {/* 🎨 ABAS DO PAINEL — visual tech com containers coloridos */}
          <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#ffffff", padding: "8px 6px", gap: 4 }}>
            {[
              { key: "perfil",    icon: "👤", label: "Perfil",    cor: "#2563eb" },
              { key: "protocolo", icon: "📋", label: "Protocolo", cor: "#10b981" },
              { key: "funil",     icon: "🎯", label: "Funil",     cor: "#f59e0b" },
              { key: "etiquetas", icon: "🏷️", label: "Tags",      cor: "#ec4899" },
              { key: "ia",        icon: "🤖", label: "IA",        cor: "#8b5cf6" },
              { key: "utils",     icon: "🔧", label: "Utils",     cor: "#6b7280" },
            ].map(a => {
              const ativa = abaPainel === a.key;
              return (
                <button key={a.key} onClick={() => setAbaPainel(a.key as any)} title={a.label}
                  style={{ flex: 1, padding: "6px 2px", background: ativa ? `${a.cor}12` : "transparent", border: "none", borderRadius: 8, cursor: "pointer", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.15s" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: ativa ? a.cor : `${a.cor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, boxShadow: ativa ? `0 3px 8px ${a.cor}40` : "none", transition: "all 0.15s" }}>
                    <span style={{ filter: ativa ? "saturate(0) brightness(2)" : "none" }}>{a.icon}</span>
                  </div>
                  <span style={{ color: ativa ? a.cor : "#9ca3af", fontSize: 9, fontWeight: ativa ? 700 : 500 }}>{a.label}</span>
                  {a.key === "etiquetas" && etiquetasAtendimento.length > 0 && (
                    <span style={{ position: "absolute", top: 2, right: 4, background: "#ec4899", color: "#ffffff", borderRadius: 10, minWidth: 14, height: 14, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, padding: "0 4px", boxShadow: "0 2px 4px rgba(236,72,153,0.4)" }}>{etiquetasAtendimento.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {abaPainel === "perfil" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, margin: "0 auto 12px", boxShadow: "0 8px 20px rgba(37,99,235,0.25)" }}><span style={{ filter: "saturate(0) brightness(2)" }}>👤</span></div>
                  <p style={{ color: "#1f2937", fontSize: 14, fontWeight: "bold", margin: 0 }}>{atendimentoAtivo.nome}</p>
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nome *</label>
                  <input value={atendimentoAtivo.nome || ""} onChange={e => setAtendimentoAtivo({ ...atendimentoAtivo, nome: e.target.value })} onBlur={e => salvarCampoContato("nome", e.target.value)} style={inputSm} />
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Telefone</label>
                  <input value={atendimentoAtivo.numero || ""} disabled style={{ ...inputSm, opacity: 0.6 }} />
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Canal</label>
                  <input value={atendimentoAtivo.canal_id ? `${iconeCanal(atendimentoAtivo.canal_id, atendimentoAtivo.origem)} ${nomeDoCanal(atendimentoAtivo.canal_id, atendimentoAtivo.origem)}` : "—"} disabled style={{ ...inputSm, opacity: 0.6 }} />
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>E-mail</label>
                  <input type="email" placeholder="contato@email.com" value={atendimentoAtivo.email || ""} onChange={e => setAtendimentoAtivo({ ...atendimentoAtivo, email: e.target.value })} onBlur={e => salvarCampoContato("email", e.target.value)} style={inputSm} />
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Atendente</label>
                  <input value={atendimentoAtivo.atendente ? nomeDoAtendente(atendimentoAtivo.atendente) : "—"} disabled style={{ ...inputSm, opacity: 0.6 }} />
                </div>
              </div>
            )}

            {abaPainel === "protocolo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: "#dcfce7", borderRadius: 8, padding: 12 }}>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase" }}>Número do Protocolo</label>
                  <p style={{ color: "#00a884", fontSize: 16, fontWeight: "bold", margin: "4px 0 0", fontFamily: "monospace" }}>#{String(atendimentoAtivo.id).padStart(6, "0")}</p>
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Avaliação</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => salvarCampoContato("avaliacao", n)} style={{ background: (atendimentoAtivo.avaliacao || 0) >= n ? "#f59e0b" : "#1f2937", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 12px", fontSize: 16, cursor: "pointer" }}>⭐</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notas</label>
                  <textarea value={atendimentoAtivo.notas || ""} onChange={e => setAtendimentoAtivo({ ...atendimentoAtivo, notas: e.target.value })} onBlur={e => salvarCampoContato("notas", e.target.value)} rows={8} style={{ ...inputSm, resize: "vertical", minHeight: 100 }} />
                </div>
              </div>
            )}

            {abaPainel === "funil" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Etapa</label>
                  <select value={atendimentoAtivo.funil_etapa || ""} onChange={e => salvarCampoContato("funil_etapa", e.target.value)} style={inputSm}>
                    <option value="">Sem etapa</option>
                    {funilEtapas.length > 0 ? (
                      funilEtapas.map(et => (
                        <option key={et.opcao} value={et.opcao}>
                          {et.tipo === "ganho" ? "✅ " : et.tipo === "perdido" ? "❌ " : "▸ "}{et.opcao}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="novo">🆕 Novo Lead</option>
                        <option value="contato">📞 Primeiro Contato</option>
                        <option value="qualificacao">🎯 Qualificação</option>
                        <option value="proposta">💰 Proposta</option>
                        <option value="negociacao">🤝 Negociação</option>
                        <option value="fechado_ganho">✅ Fechado Ganho</option>
                        <option value="fechado_perdido">❌ Fechado Perdido</option>
                      </>
                    )}
                  </select>
                  {funilEtapas.length > 0 ? (
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "6px 0 0", lineHeight: 1.4 }}>
                      🎯 Etapas sincronizadas com o seu <b>Funil de Vendas</b> (definidas no Editor de Proposta). ✅ = ganho · ❌ = perdido.
                    </p>
                  ) : (
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "6px 0 0", lineHeight: 1.4 }}>
                      💡 Configure um campo de status no <b>Editor de Proposta / Funil</b> pra estas etapas virarem as do seu negócio.
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Valor (R$)</label>
                  <input type="number" step="0.01" value={atendimentoAtivo.valor || 0} onChange={e => setAtendimentoAtivo({ ...atendimentoAtivo, valor: parseFloat(e.target.value) || 0 })} onBlur={e => salvarCampoContato("valor", parseFloat(e.target.value) || 0)} style={inputSm} />
                </div>
              </div>
            )}

            {abaPainel === "etiquetas" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {etiquetasWorkspace.length === 0 ? (
                  <div style={{ background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 10, padding: 24, textAlign: "center" }}>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>Nenhuma etiqueta criada. Vá em Cadastros → Etiquetas.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {etiquetasWorkspace.map(et => {
                      const marcada = etiquetasAtendimento.includes(et.id);
                      return (
                        <button key={et.id} onClick={() => toggleEtiqueta(et.id)}
                          style={{ background: marcada ? `${et.cor}15` : "#ffffff", border: `1px solid ${marcada ? et.cor : "#e5e7eb"}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "all 0.15s", boxShadow: marcada ? `0 2px 6px ${et.cor}25` : "0 1px 2px rgba(0,0,0,0.03)" }}
                          onMouseEnter={(e) => { if (!marcada) { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#d1d5db"; } }}
                          onMouseLeave={(e) => { if (!marcada) { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#e5e7eb"; } }}>
                          <div style={{ background: marcada ? et.cor : `${et.cor}20`, borderRadius: 7, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, transition: "background 0.15s" }}>
                            <span style={{ filter: marcada ? "saturate(0) brightness(2)" : "none" }}>{et.icone || "🏷️"}</span>
                          </div>
                          <span style={{ flex: 1, color: marcada ? et.cor : "#1f2937", fontSize: 13, fontWeight: marcada ? 700 : 600, textAlign: "left" }}>{et.nome}</span>
                          {marcada && <span style={{ background: et.cor, color: "#ffffff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, boxShadow: `0 2px 6px ${et.cor}50` }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {abaPainel === "ia" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[{ key: "bloqueado_ia", label: "🤖 ChatGPT / IA", cor: "#16a34a" }, { key: "bloqueado_typebot", label: "🔀 TypeBOT", cor: "#2563eb" }].map(item => {
                  const bloqueado = !!(atendimentoAtivo as any)[item.key];
                  return (
                    <div key={item.key} style={{ background: "#dcfce7", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ color: "#1f2937", fontSize: 13, fontWeight: "bold", margin: 0 }}>{item.label}</p>
                        <button onClick={() => salvarCampoContato(item.key, !bloqueado)} style={{ width: 44, height: 24, background: bloqueado ? "#dc2626" : item.cor, borderRadius: 12, cursor: "pointer", border: "none", position: "relative" }}>
                          <div style={{ width: 18, height: 18, background: "white", borderRadius: "50%", position: "absolute", top: 3, left: bloqueado ? 23 : 3, transition: "left 0.2s" }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {abaPainel === "utils" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <button onClick={exportarPDF} style={{ background: "#dc262622", color: "#dc2626", border: "1px solid #dc262633", borderRadius: 8, padding: "12px", fontSize: 13, cursor: "pointer", fontWeight: "bold" }}>📄 Exportar Histórico em PDF</button>
                <button onClick={() => { navigator.clipboard.writeText(numeroSanitizado(atendimentoAtivo.numero)); notify("Número copiado.", "sucesso"); }} style={{ background: "#16a34a22", color: "#16a34a", border: "1px solid #16a34a33", borderRadius: 8, padding: "10px", fontSize: 12, cursor: "pointer", fontWeight: "bold" }}>📋 Copiar número</button>
                <button onClick={() => window.open(`https://wa.me/${numeroSanitizado(atendimentoAtivo.numero)}`, "_blank")} style={{ background: "#2563eb22", color: "#2563eb", border: "1px solid #2563eb33", borderRadius: 8, padding: "10px", fontSize: 12, cursor: "pointer", fontWeight: "bold" }}>📞 Abrir no WhatsApp Web</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🆕 MODAL — Encerrar atendimentos antigos por inatividade */}
      {showEncerrarAntigos && (
        <div onClick={() => !encerrandoAntigos && setShowEncerrarAntigos(false)}
          style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: ehClaro ? "#ffffff" : "#111b21", borderRadius: 12, width: "100%", maxWidth: 480, padding: 24, border: `1px solid ${tema.bordaSutil}` }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ color: tema.textoForte, fontSize: 18, fontWeight: "bold", margin: "0 0 6px" }}>🧹 Encerrar atendimentos antigos</h2>
              <p style={{ color: tema.textoFraco, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                Vai marcar como <b>resolvido</b> todos os atendimentos pendentes que estão sem nova interação há mais tempo que o limite escolhido.
              </p>
            </div>
            <p style={{ color: tema.textoNormal, fontSize: 12, fontWeight: "bold", textTransform: "uppercase", margin: "0 0 8px" }}>Encerrar pendentes há mais de:</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[1, 2, 3, 7].map(d => {
                const qtde = contarPendentesAntigos(d as 1 | 2 | 3 | 7);
                const ativo = diasAntiguidade === d;
                return (
                  <button key={d} onClick={() => setDiasAntiguidade(d as 1 | 2 | 3 | 7)}
                    style={{ background: ativo ? "#f59e0b22" : (ehClaro ? "#f3f4f6" : "#1f2937"), border: `2px solid ${ativo ? "#f59e0b" : tema.bordaForte}`, borderRadius: 10, padding: "12px 8px", cursor: "pointer", textAlign: "center" }}>
                    <p style={{ color: ativo ? "#f59e0b" : tema.textoForte, fontSize: 14, fontWeight: "bold", margin: "0 0 4px" }}>{d} {d === 1 ? "dia" : "dias"}</p>
                    <p style={{ color: tema.textoFraco, fontSize: 10, margin: 0 }}>{qtde} {qtde === 1 ? "atend." : "atend."}</p>
                  </button>
                );
              })}
            </div>
            {(() => {
              const qtde = contarPendentesAntigos(diasAntiguidade);
              return (
                <div style={{ background: qtde > 0 ? "#f59e0b22" : (ehClaro ? "#f3f4f6" : "#1f2937"), border: `1px solid ${qtde > 0 ? "#f59e0b66" : tema.bordaSutil}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <p style={{ color: qtde > 0 ? "#f59e0b" : tema.textoFraco, fontSize: 13, margin: 0, fontWeight: "bold" }}>
                    {qtde > 0 ? `⚠️ ${qtde} atendimento(s) será(ão) encerrado(s)` : "✅ Nenhum atendimento atende esse critério"}
                  </p>
                  <p style={{ color: tema.textoFraco, fontSize: 11, margin: "4px 0 0", lineHeight: 1.4 }}>
                    Cada atendimento receberá uma mensagem de sistema explicando o motivo do encerramento. Ação irreversível — mas você pode reabrir manualmente depois se precisar.
                  </p>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowEncerrarAntigos(false)} disabled={encerrandoAntigos}
                style={{ background: "none", color: tema.textoNormal, border: `1px solid ${tema.bordaForte}`, borderRadius: 8, padding: "10px 18px", fontSize: 13, cursor: encerrandoAntigos ? "wait" : "pointer" }}>Cancelar</button>
              <button onClick={() => encerrarAtendimentosAntigos(diasAntiguidade)} disabled={encerrandoAntigos || contarPendentesAntigos(diasAntiguidade) === 0}
                style={{ background: encerrandoAntigos || contarPendentesAntigos(diasAntiguidade) === 0 ? "#6b7280" : "#f59e0b", color: "#1f2937", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 13, fontWeight: "bold", cursor: encerrandoAntigos || contarPendentesAntigos(diasAntiguidade) === 0 ? "not-allowed" : "pointer" }}>
                {encerrandoAntigos ? "⏳ Encerrando..." : `🧹 Encerrar ${contarPendentesAntigos(diasAntiguidade)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔔 TOAST CONTAINER */}
      {/* ══════════ 💰 PAINEL DO CLIENTE — MODO COBRANÇA ══════════ */}
      {modoCobranca && atendimentoAtivo && (
        <div style={{ position: "fixed", top: 86, right: 14, zIndex: 1200, width: 300, maxHeight: "72vh", overflowY: "auto", background: "#ffffff", border: "1px solid #e5e7eb", borderTop: "3px solid #dc2626", borderRadius: 14, boxShadow: "0 14px 36px rgba(0,0,0,0.16)" }}>
          <div onClick={() => setPainelCobAberto(v => !v)}
            style={{ padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderBottom: painelCobAberto ? "1px solid #f3f4f6" : "none" }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#dc2626" }}>💰 Cliente na Cobrança</span>
            <span style={{ color: "#9ca3af", fontSize: 13, fontWeight: 700 }}>{painelCobAberto ? "▾" : "▸"}</span>
          </div>
          {painelCobAberto && (
            !clienteCob ? (
              <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, padding: "14px", fontStyle: "italic" }}>
                Nenhum cliente do CRM com esse telefone.
              </p>
            ) : (
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <p style={{ margin: 0, color: "#1f2937", fontSize: 13, fontWeight: 800 }}>{clienteCob.nome}</p>
                  <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 11, fontFamily: "monospace" }}>{clienteCob.cpf || "sem CPF"}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                  <div style={{ background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "6px 8px" }}>
                    <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 9, textTransform: "uppercase", display: "block" }}>Plano</span>
                    <span style={{ color: "#1f2937", fontWeight: 700 }}>{clienteCob.plano || "—"}</span>
                  </div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 8px" }}>
                    <span style={{ color: "#15803d", fontWeight: 700, fontSize: 9, textTransform: "uppercase", display: "block" }}>Valor</span>
                    <span style={{ color: "#16a34a", fontWeight: 800 }}>R$ {Number(clienteCob.valor_plano || 0).toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div style={{ background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "6px 8px" }}>
                    <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 9, textTransform: "uppercase", display: "block" }}>Vencimento</span>
                    <span style={{ color: "#1f2937", fontWeight: 700 }}>{clienteCob.vencimento ? `Dia ${clienteCob.vencimento}` : "—"}</span>
                  </div>
                  <div style={{ background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "6px 8px" }}>
                    <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 9, textTransform: "uppercase", display: "block" }}>OS</span>
                    <span style={{ color: "#1f2937", fontWeight: 700, fontSize: 10 }}>{clienteCob.dados_customizados?.os || "—"}</span>
                  </div>
                </div>
                <div>
                  <p style={{ margin: "2px 0 5px", color: "#6b7280", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>Faturas marcadas</p>
                  {faturasCob.length === 0 ? (
                    <p style={{ margin: 0, color: "#9ca3af", fontSize: 11, fontStyle: "italic" }}>Nenhum status de fatura registrado ainda.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {faturasCob.map((f: any, i: number) => {
                        const st = normCob(f.status);
                        const paga = st.includes("PAGA");
                        const neg = st.includes("NEGOC");
                        const cor = paga ? "#16a34a" : neg ? "#7c3aed" : "#dc2626";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: `${cor}0d`, border: `1px solid ${cor}30`, borderRadius: 7, padding: "5px 8px" }}>
                            <span style={{ color: "#374151", fontSize: 11, fontWeight: 700 }}>{f.numero_referencia}</span>
                            <span style={{ color: cor, fontSize: 10.5, fontWeight: 800 }}>
                              {paga ? "✅ Paga" : neg ? "📞 Negociação" : "🔴 Em aberto"}
                              {f.valor_pago ? ` · R$ ${Number(f.valor_pago).toFixed(2).replace(".", ",")}` : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <a href="/crm/cobranca" style={{ display: "block", textAlign: "center", background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)", color: "#ffffff", borderRadius: 9, padding: "8px 10px", fontSize: 11.5, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}>
                  💰 Abrir na Cobrança
                </a>
              </div>
            )
          )}
        </div>
      )}

      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 99999, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
        {toasts.map(t => {
          const cores = {
            sucesso: { bg: "#065f46", border: "#10b981", icone: "✅" },
            erro:    { bg: "#7f1d1d", border: "#ef4444", icone: "❌" },
            aviso:   { bg: "#78350f", border: "#f59e0b", icone: "⚠️" },
            info:    { bg: "#1e3a8a", border: "#2563eb", icone: "ℹ️" }}[t.tipo];
          return (
            <div key={t.id} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: cores.bg, border: `1px solid ${cores.border}`, borderLeft: `4px solid ${cores.border}`, color: "#1f2937", padding: "14px 18px", borderRadius: 10, minWidth: 300, maxWidth: 420, boxShadow: "0 10px 25px rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", gap: 12, pointerEvents: "auto", cursor: "pointer", animation: "wolfToastIn 0.25s ease-out" }}
              title="Clique pra fechar">
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{cores.icone}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{t.msg}</p>
                {t.subMsg && <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>{t.subMsg}</p>}
              </div>
              <span style={{ color: "#1f2937", opacity: 0.5, fontSize: 16, lineHeight: 1, flexShrink: 0, fontWeight: "bold" }}>×</span>
            </div>
          );
        })}
        <style>{`
          @keyframes wolfToastIn {
            from { opacity: 0; transform: translateX(20px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </div>
    </div>
  );
}