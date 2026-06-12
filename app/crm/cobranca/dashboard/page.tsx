"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";
import {
  type Proposta, type FaturaStatusDB, type ClienteCob, type FaturaPlan, type Bucket,
  BUCKET_META, formatNum, pctOf,
  calcularProxVenc, rotuloProx, diaVencimento,
  carregarPropostas, carregarFaturasStatus,
} from "../../../lib/cobranca_lib";

const card = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const input = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", color: "#1f2937", fontSize: 13, outline: "none", boxSizing: "border-box" as const };
const btnSec = { background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

// status do banco → bucket
const bucketDoStatus = (s: string): Bucket | null => {
  if (s === "paga" || s === "paga_atraso") return "paga";
  if (s === "pendente") return "pendente";
  if (s === "atrasada") return "inadimplente";
  return null; // promessa/acordo/negociacao/cancelada/etc. não entram na contagem de cobrança
};

export default function CobrancaDashboard() {
  const router = useRouter();
  const perm = useTemPermissao();
  const permitido = perm.carregando ? null : (perm.superAdmin || perm.escopo("cobranca.acessar") !== "none");

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [statusMap, setStatusMap] = useState<Map<string, FaturaStatusDB>>(new Map());
  const [vazio, setVazio] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "paga" | "pendente" | "inadimplente">("todos");
  const [pagina, setPagina] = useState(1);
  const SIZE = 25;

  useEffect(() => {
    const ck = () => setIsMobile(window.innerWidth < 768);
    ck(); window.addEventListener("resize", ck);
    return () => window.removeEventListener("resize", ck);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const [rp, rf] = await Promise.all([carregarPropostas(), carregarFaturasStatus()]);
      setPropostas(rp.propostas);
      setStatusMap(rf.statusMap);
      setVazio(rf.statusMap.size === 0);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // monta clientes a partir do que está GRAVADO em faturas_status
  const res = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const propById = new Map<number, Proposta>();
    for (const p of propostas) propById.set(p.id, p);

    const m = new Map<number, ClienteCob>();
    for (const fs of statusMap.values()) {
      const bucket = bucketDoStatus(fs.status);
      if (!bucket) continue;
      const prop = propById.get(fs.proposta_id);
      // reconstrói o vencimento: mês de numero_referencia + dia de vencimento da proposta
      let venc: Date | null = null;
      const mref = (fs.numero_referencia || "").match(/^(\d{4})-(\d{2})/);
      if (mref) venc = new Date(Number(mref[1]), Number(mref[2]) - 1, diaVencimento(prop));
      const pag = fs.data_pagamento || null;
      const diasPag = (bucket === "paga" && venc && pag) ? Math.round((new Date(pag + "T00:00:00").getTime() - venc.getTime()) / 86400000) : null;

      let c = m.get(fs.proposta_id);
      if (!c) {
        c = {
          ordem: String(prop?.dados_customizados?.os || ""),
          custcode: String(prop?.dados_customizados?.custcode || ""),
          proposta: prop, nome: prop?.nome || `Proposta #${fs.proposta_id}`,
          faturas: [], pagas: 0, pendentes: 0, inadimplentes: 0, somaDiasPagamento: 0,
          matched: !!prop, custcodeNovo: false, prox: { estado: "em_dia", dias: 0, data: null },
        };
        m.set(fs.proposta_id, c);
      }
      const fat: FaturaPlan = { ref: fs.numero_referencia, status: fs.status, bucket, venc, pag, diasPagamento: diasPag };
      c.faturas.push(fat);
      if (bucket === "paga") { c.pagas++; if (diasPag != null) c.somaDiasPagamento += diasPag; }
      else if (bucket === "pendente") c.pendentes++;
      else c.inadimplentes++;
    }

    const arr = Array.from(m.values());
    for (const c of arr) c.prox = calcularProxVenc(c.faturas, hoje, 0);
    arr.sort((a, b) => b.inadimplentes - a.inadimplentes || a.prox.dias - b.prox.dias);
    let pg = 0, pe = 0, ina = 0, tot = 0, soma = 0, qPag = 0;
    for (const c of arr) { pg += c.pagas; pe += c.pendentes; ina += c.inadimplentes; tot += c.faturas.length; soma += c.somaDiasPagamento; qPag += c.pagas; }
    return {
      clientes: arr, totFat: tot, pagas: pg, pendentes: pe, inadimplentes: ina,
      totalClientes: arr.length, clientesInad: arr.filter(c => c.inadimplentes > 0).length,
      somaDiasPagamento: soma, mediaDiasPagamento: qPag > 0 ? Math.round(soma / qPag) : 0,
      aVencer7: arr.filter(c => c.prox.estado === "a_vencer" && c.prox.dias <= 7).length,
    };
  }, [propostas, statusMap]);

  const lista = useMemo(() => {
    let arr = res.clientes;
    if (filtro === "paga") arr = arr.filter(c => c.pagas > 0);
    else if (filtro === "pendente") arr = arr.filter(c => c.pendentes > 0);
    else if (filtro === "inadimplente") arr = arr.filter(c => c.inadimplentes > 0);
    const b = busca.trim().toLowerCase();
    if (b) arr = arr.filter(c => c.nome.toLowerCase().includes(b) || c.custcode.toLowerCase().includes(b) || c.ordem.toLowerCase().includes(b));
    return arr;
  }, [res, filtro, busca]);
  const totalPag = Math.max(1, Math.ceil(lista.length / SIZE));
  const listaPag = useMemo(() => lista.slice((pagina - 1) * SIZE, pagina * SIZE), [lista, pagina]);
  useEffect(() => { setPagina(1); }, [filtro, busca]);

  if (permitido === null || loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#6b7280" }}>Carregando dashboard...</div>;
  if (!permitido) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}><div style={{ ...card, padding: 48, textAlign: "center" }}><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700 }}>Acesso restrito</h1></div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}><span style={{ filter: "saturate(0) brightness(2)" }}>📊</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>Dashboard de Cobrança</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: "#2563eb" }}>{formatNum(res.totFat)}</b> faturas · <b style={{ color: "#16a34a" }}>{formatNum(res.pagas)}</b> pagas · <b style={{ color: "#dc2626" }}>{formatNum(res.inadimplentes)}</b> inadimplentes</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/crm/cobranca/atualizacao")} style={btnSec}>📤 Atualizar planilha</button>
          <button onClick={() => router.push("/crm/cobranca/negociacoes")} style={btnSec}>🤝 Negociações</button>
        </div>
      </div>

      {vazio && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", borderRadius: 12, padding: "12px 18px" }}>
          <p style={{ color: "#1e40af", fontSize: 13, margin: 0, fontWeight: 700 }}>Ainda não há faturas com status gravado</p>
          <p style={{ color: "#3b82f6", fontSize: 12, margin: "2px 0 0" }}>Suba a planilha de pagamento em <b>Atualizar planilha</b> pra popular o dashboard.</p>
        </div>
      )}

      {/* cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14 }}>
        {([{ k: "paga" as const, qtd: res.pagas }, { k: "pendente" as const, qtd: res.pendentes }, { k: "inadimplente" as const, qtd: res.inadimplentes }]).map(c => {
          const meta = BUCKET_META[c.k];
          return (
            <div key={c.k} style={{ ...card, padding: isMobile ? 14 : 18, borderTop: `4px solid ${meta.cor}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: meta.bg, border: `1px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{meta.icone}</div>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, margin: 0, textTransform: "uppercase" }}>{meta.label}</p>
              </div>
              <p style={{ color: meta.cor, fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0 }}>{formatNum(c.qtd)}</p>
              <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{pctOf(c.qtd, res.totFat)}% das faturas</p>
            </div>
          );
        })}
        <div style={{ ...card, padding: isMobile ? 14 : 18, borderTop: "4px solid #6366f1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "#eef2ff", border: "1px solid #c7d2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📆</div>
            <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, margin: 0, textTransform: "uppercase" }}>Dias p/ pagar</p>
          </div>
          <p style={{ color: "#6366f1", fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0 }}>{formatNum(res.mediaDiasPagamento)}</p>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>média · soma {formatNum(res.somaDiasPagamento)}d</p>
        </div>
      </div>

      {/* proporção + destaque a vencer */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 14 }}>
        <div style={{ ...card, padding: isMobile ? 16 : 20 }}>
          <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>📊 Proporção das faturas</p>
          <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            {([{ q: res.pagas, cor: "#16a34a" }, { q: res.pendentes, cor: "#d97706" }, { q: res.inadimplentes, cor: "#dc2626" }]).map((s, i) => {
              const p = pctOf(s.q, res.totFat);
              return s.q > 0 ? <div key={i} style={{ width: `${p}%`, background: s.cor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{p >= 8 ? `${p}%` : ""}</div> : null;
            })}
          </div>
        </div>
        <div style={{ ...card, padding: isMobile ? 16 : 20, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>⏰</div>
          <div>
            <p style={{ color: "#d97706", fontSize: 22, fontWeight: 800, margin: 0 }}>{formatNum(res.aVencer7)}</p>
            <p style={{ color: "#6b7280", fontSize: 12, margin: 0, fontWeight: 600 }}>cliente(s) vencem em ≤7 dias</p>
          </div>
        </div>
      </div>

      {/* tabela: nome | custcode | próximo vencimento */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>👥 Clientes ({formatNum(lista.length)})</h3>
          <input placeholder="🔍 nome, custcode ou ordem..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...input, marginLeft: "auto", padding: "7px 12px", fontSize: 12, borderRadius: 20, width: isMobile ? "100%" : 260 }} />
        </div>
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([{ k: "todos", l: "Todos" }, { k: "inadimplente", l: "🔴 Inadimplentes" }, { k: "pendente", l: "⏳ Pendentes" }, { k: "paga", l: "✅ Pagas" }] as { k: typeof filtro; l: string }[]).map(f => (
            <button key={f.k} onClick={() => setFiltro(f.k)} style={{ borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, border: `1px solid ${filtro === f.k ? "#2563eb" : "#e5e7eb"}`, background: filtro === f.k ? "#eff6ff" : "#fff", color: filtro === f.k ? "#2563eb" : "#6b7280" }}>{f.l}</button>
          ))}
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 760 : "auto" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Cliente", "CUSTCODE", "Próximo vencimento", "Fat.", "✅", "⏳", "🔴"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaPag.map((c, i) => {
                const rp = rotuloProx(c.prox);
                return (
                  <tr key={c.proposta?.id ?? c.nome + i} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                    <td style={{ padding: "11px 14px", color: "#1f2937", fontSize: 13, fontWeight: 700, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</td>
                    <td style={{ padding: "11px 14px" }}><span style={{ fontFamily: "monospace", fontSize: 12.5, color: c.custcode ? "#1f2937" : "#9ca3af", fontWeight: 700 }}>{c.custcode || "—"}</span></td>
                    <td style={{ padding: "11px 14px" }}><span style={{ background: rp.bg, color: rp.cor, border: `1px solid ${rp.border}`, fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{rp.texto}</span></td>
                    <td style={{ padding: "11px 14px", color: "#374151", fontSize: 13, fontWeight: 600 }}>{c.faturas.length}</td>
                    <td style={{ padding: "11px 14px", color: c.pagas > 0 ? "#16a34a" : "#d1d5db", fontSize: 13, fontWeight: 700 }}>{c.pagas || "—"}</td>
                    <td style={{ padding: "11px 14px", color: c.pendentes > 0 ? "#d97706" : "#d1d5db", fontSize: 13, fontWeight: 700 }}>{c.pendentes || "—"}</td>
                    <td style={{ padding: "11px 14px", color: c.inadimplentes > 0 ? "#dc2626" : "#d1d5db", fontSize: 13, fontWeight: 700 }}>{c.inadimplentes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPag > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 14 }}>
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} style={{ ...btnSec, padding: "7px 14px", opacity: pagina === 1 ? 0.5 : 1 }}>← Anterior</button>
            <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>Pág. {pagina} / {totalPag}</span>
            <button onClick={() => setPagina(p => Math.min(totalPag, p + 1))} disabled={pagina === totalPag} style={{ ...btnSec, padding: "7px 14px", opacity: pagina === totalPag ? 0.5 : 1 }}>Próxima →</button>
          </div>
        )}
      </div>
    </div>
  );
}