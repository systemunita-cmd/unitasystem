// ═══════════════════════════════════════════════════════════════════════════
// 💰 lib/cobranca_lib.ts — núcleo compartilhado da Cobrança (UnitaSystem)
// Usado por: crm/cobranca/dashboard, crm/cobranca/negociacoes, crm/cobranca/atualizacao
// ───────────────────────────────────────────────────────────────────────────
// Regra de inadimplência: "não pagou" continua PENDENTE até o próximo
// vencimento (vencimento + 1 mês). Passou disso → INADIMPLENTE.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

// ─── TIPOS ───────────────────────────────────────────────────────────────────
export type Proposta = {
  id: number;
  nome?: string | null;
  telefone1?: string | null;
  plano?: string | null;
  valor_plano?: number | null;
  vencimento?: string | null;
  status_venda?: string | null;
  cpf?: string | null;
  dados_customizados?: Record<string, any> | null;
  created_at: string;
};

export type StatusFatura = "paga" | "paga_atraso" | "pendente" | "atrasada";
export type Bucket = "paga" | "pendente" | "inadimplente";

export type FaturaStatusDB = {
  proposta_id: number;
  numero_referencia: string;
  status: StatusFatura;
  data_pagamento?: string | null;
  promessa_data?: string | null;
  observacoes?: string | null;
  atualizado_por?: string | null;
  updated_at?: string;
};

export type FaturaPlan = {
  ref: string;                 // "YYYY-MM" do vencimento
  status: StatusFatura;
  bucket: Bucket;
  venc: Date | null;
  pag: string | null;          // ISO "YYYY-MM-DD"
  diasPagamento: number | null; // pag - venc (dias), só pra pagas
};

export type ProxVenc = {
  estado: "a_vencer" | "inadimplente" | "em_dia";
  dias: number;                 // a_vencer: dias que faltam; inadimplente: dias vencido
  data: Date | null;            // data limite (próximo vencimento)
};

export type ClienteCob = {
  ordem: string;
  custcode: string;
  proposta?: Proposta;
  nome: string;
  faturas: FaturaPlan[];
  pagas: number;
  pendentes: number;
  inadimplentes: number;
  somaDiasPagamento: number;    // soma dos dias de pagamento (pagas)
  matched: boolean;
  custcodeNovo: boolean;
  prox: ProxVenc;
};

export type ColKey = "ordem" | "custcode" | "status" | "vencimento" | "pagamento" | "numero_fatura";

// ─── DETECÇÃO DE COLUNAS DA PLANILHA ─────────────────────────────────────────
export const DETECTAR: { key: ColKey; label: string; obrig: boolean; testa: (h: string) => boolean }[] = [
  { key: "ordem",         label: "Número da ordem (cliente)", obrig: true,  testa: h => /ordem/.test(h) },
  { key: "custcode",      label: "Custcode do cliente",       obrig: true,  testa: h => /custcode/.test(h) && /cliente/.test(h) },
  { key: "status",        label: "Status do pagamento",       obrig: true,  testa: h => /status/.test(h) && /pagamento|pagto/.test(h) },
  { key: "vencimento",    label: "Data de vencimento",        obrig: true,  testa: h => /data/.test(h) && /vencimento|venc/.test(h) },
  { key: "pagamento",     label: "Data de pagamento",         obrig: false, testa: h => /data/.test(h) && /pagamento|pagto/.test(h) },
  { key: "numero_fatura", label: "Número da fatura",          obrig: false, testa: h => /n[uú]mero/.test(h) && /fatura/.test(h) },
];

// ─── HELPERS DE FORMATO ──────────────────────────────────────────────────────
export const formatNum = (v: number) => (v || 0).toLocaleString("pt-BR");
export const formatBRL = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pctOf = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
export const refDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const formatData = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? parseData(d) : d;
  if (!dt || isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export function parseData(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export const codigoStatus = (txt: string): number | null => {
  const m = String(txt || "").trim().match(/^\s*0?(\d)/);
  return m ? Number(m[1]) : null;
};

// próximo vencimento = vencimento + 1 mês (+ carência opcional em dias)
export function proximoVencimento(venc: Date, carenciaDias = 0): Date {
  const d = new Date(venc);
  d.setMonth(d.getMonth() + 1);
  if (carenciaDias) d.setDate(d.getDate() + carenciaDias);
  return d;
}

// classifica uma fatura. "não pagou" só vira inadimplente depois do próximo vencimento.
export function classificar(statusTxt: string, venc: Date | null, hoje: Date, carenciaDias = 0): { status: StatusFatura; bucket: Bucket } {
  const cod = codigoStatus(statusTxt);
  const t = String(statusTxt || "").toLowerCase();
  if (cod === 1 || /pagou at[eé] a data/.test(t)) return { status: "paga", bucket: "paga" };
  if (cod === 2 || cod === 3 || cod === 4 || (/pagou/.test(t) && !/n[aã]o pagou/.test(t))) return { status: "paga_atraso", bucket: "paga" };
  if (cod === 5 || /n[aã]o pagou/.test(t)) {
    if (!venc) return { status: "pendente", bucket: "pendente" };
    const limite = proximoVencimento(venc, carenciaDias);
    return hoje > limite ? { status: "atrasada", bucket: "inadimplente" } : { status: "pendente", bucket: "pendente" };
  }
  if (venc) {
    const limite = proximoVencimento(venc, carenciaDias);
    if (hoje > limite) return { status: "atrasada", bucket: "inadimplente" };
  }
  return { status: "pendente", bucket: "pendente" };
}

// dias que faltam para o próximo vencimento (pra não virar inadimplente)
export function calcularProxVenc(faturas: FaturaPlan[], hoje: Date, carenciaDias = 0): ProxVenc {
  const naoPagas = faturas.filter(f => f.bucket !== "paga" && f.venc);
  if (naoPagas.length === 0) return { estado: "em_dia", dias: 0, data: null };
  const comLimite = naoPagas.map(f => {
    const limite = proximoVencimento(f.venc as Date, carenciaDias);
    const dias = Math.ceil((limite.getTime() - hoje.getTime()) / 86400000);
    return { limite, dias };
  });
  // a mais urgente = menor "dias" (negativo = já passou)
  comLimite.sort((a, b) => a.dias - b.dias);
  const u = comLimite[0];
  if (u.dias < 0) return { estado: "inadimplente", dias: -u.dias, data: u.limite };
  return { estado: "a_vencer", dias: u.dias, data: u.limite };
}

// ─── META DE STATUS / BUCKET ─────────────────────────────────────────────────
export const STATUS_META: Record<StatusFatura, { label: string; icone: string; bg: string; border: string; color: string }> = {
  paga:        { label: "Paga",           icone: "✅", bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a" },
  paga_atraso: { label: "Paga c/ atraso", icone: "⏰", bg: "#ecfdf5", border: "#a7f3d0", color: "#059669" },
  pendente:    { label: "A vencer",       icone: "⏳", bg: "#fffbeb", border: "#fde68a", color: "#d97706" },
  atrasada:    { label: "Inadimplente",   icone: "🔴", bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
};
export const BUCKET_META: Record<Bucket, { label: string; icone: string; cor: string; bg: string; border: string }> = {
  paga:         { label: "Pagas",         icone: "✅", cor: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  pendente:     { label: "Pendentes",     icone: "⏳", cor: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  inadimplente: { label: "Inadimplentes", icone: "🔴", cor: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

// rótulo curto do "próximo vencimento" pra mostrar ao lado do nome
export function rotuloProx(p: ProxVenc): { texto: string; cor: string; bg: string; border: string } {
  if (p.estado === "em_dia") return { texto: "Em dia", cor: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" };
  if (p.estado === "inadimplente") return { texto: `Vencida há ${p.dias}d`, cor: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
  const urgente = p.dias <= 5;
  return {
    texto: `Faltam ${p.dias}d${p.data ? ` (${p.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })})` : ""}`,
    cor: urgente ? "#d97706" : "#2563eb",
    bg: urgente ? "#fffbeb" : "#eff6ff",
    border: urgente ? "#fde68a" : "#bfdbfe",
  };
}

// ─── CARREGAMENTO ────────────────────────────────────────────────────────────
export async function carregarPropostas(): Promise<{ propostas: Proposta[]; faltando: boolean }> {
  const COLS = "id, nome, telefone1, plano, valor_plano, vencimento, status_venda, cpf, dados_customizados, created_at";
  const PAGE = 1000; let acc: any[] = []; let off = 0;
  try {
    while (off < 600000) {
      const { data, error } = await supabase.from("proposta").select(COLS).order("id", { ascending: true }).range(off, off + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      acc = acc.concat(data);
      if (data.length < PAGE) break;
      off += PAGE;
    }
    return { propostas: acc as Proposta[], faltando: false };
  } catch (e: any) {
    return { propostas: [], faltando: e?.code === "PGRST205" };
  }
}

export async function carregarFaturasStatus(): Promise<{ statusMap: Map<string, FaturaStatusDB>; faltando: boolean }> {
  const PAGE = 1000; let acc: any[] = []; let off = 0;
  try {
    while (off < 600000) {
      const { data, error } = await supabase.from("faturas_status").select("*").order("proposta_id", { ascending: true }).range(off, off + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      acc = acc.concat(data);
      if (data.length < PAGE) break;
      off += PAGE;
    }
    const m = new Map<string, FaturaStatusDB>();
    for (const r of acc) m.set(`${r.proposta_id}_${r.numero_referencia}`, r as FaturaStatusDB);
    return { statusMap: m, faltando: false };
  } catch (e: any) {
    return { statusMap: new Map(), faltando: e?.code === "PGRST205" };
  }
}

// índice ordem de serviço (dados_customizados.os) → proposta
export function indicePorOrdem(propostas: Proposta[]): Map<string, Proposta> {
  const m = new Map<string, Proposta>();
  for (const p of propostas) {
    const os = String(p.dados_customizados?.os || "").toLowerCase().trim();
    if (os) m.set(os, p);
  }
  return m;
}

// dia de vencimento (1-31) a partir do campo proposta.vencimento
export function diaVencimento(p?: Proposta): number {
  if (!p?.vencimento) return 10;
  const s = String(p.vencimento).trim();
  const d = parseData(s);
  if (d) return d.getDate();
  const n = parseInt(s, 10);
  return n >= 1 && n <= 31 ? n : 10;
}