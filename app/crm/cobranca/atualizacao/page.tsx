"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";
import {
  type Proposta, type ColKey, type ClienteCob, type FaturaPlan,
  DETECTAR, BUCKET_META, formatNum, pctOf, refDe, codigoStatusStr, pagouComAtrasoGrave, simNao,
  parseData, classificar, calcularProxVenc, rotuloProx,
  carregarPropostas, carregarFaturasStatus, indicePorOrdem,
} from "../../../lib/cobranca_lib";

// ─── estilos ──────────────────────────────────────────────────────────────
const card = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const input = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", color: "#1f2937", fontSize: 13, outline: "none", boxSizing: "border-box" as const };
const label = { color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, display: "block", marginBottom: 6 };
const btnPri = { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" };
const btnSec = { background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

export default function CobrancaAtualizacao() {
  const router = useRouter();
  const perm = useTemPermissao();
  const permitido = perm.carregando ? null : (perm.superAdmin || perm.escopo("cobranca.acessar") !== "none");

  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [faltaTabela, setFaltaTabela] = useState(false);

  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [linhas, setLinhas] = useState<any[][]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [temCabecalho, setTemCabecalho] = useState(true);
  const [mapCols, setMapCols] = useState<Record<ColKey, number>>({ ordem: -1, custcode: -1, status: -1, vencimento: -1, pagamento: -1, numero_fatura: -1, detalhamento: -1, mes_gross: -1, observacao: -1, suspensao_fraude: -1, churn: -1, insucesso_dacc: -1, nome_banco: -1, opcao_pagamento: -1 });
  const [carencia, setCarencia] = useState(0);

  const [gravando, setGravando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro" | "aviso"; titulo: string; msg: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "paga" | "pendente" | "inadimplente" | "sem_venda">("todos");
  const [pagina, setPagina] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
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
      setUserEmail(user.email || "");
      const [rp, rf] = await Promise.all([carregarPropostas(), carregarFaturasStatus()]);
      setPropostas(rp.propostas);
      setFaltaTabela(rf.faltando);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porOrdem = useMemo(() => indicePorOrdem(propostas), [propostas]);

  const onArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setNomeArquivo(f.name); setFeedback(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        // 🆕 cellDates + raw:true → datas vêm como objeto Date REAL (não o texto "set/25").
        //    Resolve o bug do MÊS GROSS virar 2001: a célula tem a data completa por baixo.
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: "" });
        if (!rows || rows.length === 0) { setFeedback({ tipo: "aviso", titulo: "Planilha vazia", msg: "Não consegui ler nenhuma linha." }); return; }
        setLinhas(rows); setPagina(1);
        const head = (rows[0] || []).map((c: any) => String(c || "").toLowerCase().trim());
        const novo: Record<ColKey, number> = { ordem: -1, custcode: -1, status: -1, vencimento: -1, pagamento: -1, numero_fatura: -1, detalhamento: -1, mes_gross: -1, observacao: -1, suspensao_fraude: -1, churn: -1, insucesso_dacc: -1, nome_banco: -1, opcao_pagamento: -1 };
        for (const d of DETECTAR) novo[d.key] = head.findIndex(h => d.testa(h));
        setMapCols(novo); setTemCabecalho(true);
      } catch (err: any) {
        setFeedback({ tipo: "erro", titulo: "Erro ao ler a planilha", msg: err?.message || "Arquivo inválido." });
      }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = "";
  };

  const cabecalhos = useMemo(() => {
    if (linhas.length === 0) return [];
    if (temCabecalho) return (linhas[0] || []).map((c: any, i: number) => String(c || "").trim() || `Coluna ${i + 1}`);
    return (linhas[0] || []).map((_: any, i: number) => `Coluna ${i + 1}`);
  }, [linhas, temCabecalho]);
  const dados = useMemo(() => (temCabecalho ? linhas.slice(1) : linhas), [linhas, temCabecalho]);
  const colsOk = mapCols.ordem >= 0 && mapCols.custcode >= 0 && mapCols.status >= 0 && mapCols.vencimento >= 0;

  // ─── processamento ───────────────────────────────────────────────────────
  const res = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const m = new Map<string, ClienteCob>();
    if (colsOk) {
      for (const linha of dados) {
        const ordem = String(linha[mapCols.ordem] || "").trim();
        if (!ordem) continue;
        const custcode = String(linha[mapCols.custcode] || "").trim();
        const statusTxt = String(linha[mapCols.status] || "").trim();
        const venc = parseData(linha[mapCols.vencimento]);
        const pagD = mapCols.pagamento >= 0 ? parseData(linha[mapCols.pagamento]) : null;
        const cls = classificar(statusTxt, venc, hoje, carencia);
        const diasPag = (cls.bucket === "paga" && venc && pagD) ? Math.round((pagD.getTime() - venc.getTime()) / 86400000) : null;
        const numFatRaw = mapCols.numero_fatura >= 0 ? parseInt(String(linha[mapCols.numero_fatura] || "").replace(/\D/g, ""), 10) : NaN;
        const detalhe = mapCols.detalhamento >= 0 ? String(linha[mapCols.detalhamento] || "").trim() : null;
        const fat: FaturaPlan = {
          ref: venc ? refDe(venc) : "", status: cls.status, bucket: cls.bucket, venc,
          pag: pagD ? pagD.toISOString().slice(0, 10) : null, diasPagamento: diasPag,
          numeroFatura: Number.isFinite(numFatRaw) ? numFatRaw : null,
          codigo: codigoStatusStr(statusTxt),
          statusPlanilha: statusTxt || null,
          detalhamento: detalhe || null,
          mesGross: mapCols.mes_gross >= 0 ? (parseData(linha[mapCols.mes_gross])?.toISOString().slice(0, 10) || null) : null,
          observacao: mapCols.observacao >= 0 ? (String(linha[mapCols.observacao] || "").trim() || null) : null,
          suspensaoFraude: mapCols.suspensao_fraude >= 0 ? simNao(linha[mapCols.suspensao_fraude]) : null,
          churn: mapCols.churn >= 0 ? simNao(linha[mapCols.churn]) : null,
          insucessoDacc: mapCols.insucesso_dacc >= 0 ? simNao(linha[mapCols.insucesso_dacc]) : null,
          nomeBanco: mapCols.nome_banco >= 0 ? (String(linha[mapCols.nome_banco] || "").trim() || null) : null,
          opcaoPagamento: mapCols.opcao_pagamento >= 0 ? (String(linha[mapCols.opcao_pagamento] || "").trim() || null) : null,
        };
        let c = m.get(ordem);
        if (!c) {
          const prop = porOrdem.get(ordem.toLowerCase());
          const custAtual = String(prop?.dados_customizados?.custcode || "").trim();
          c = { ordem, custcode, proposta: prop, nome: prop?.nome || "—", faturas: [], pagas: 0, pendentes: 0, inadimplentes: 0, somaDiasPagamento: 0, matched: !!prop, custcodeNovo: !!prop && custAtual !== custcode, prox: { estado: "em_dia", dias: 0, data: null }, precoce: false };
          m.set(ordem, c);
        }
        if (custcode) c.custcode = custcode;
        c.faturas.push(fat);
        if (pagouComAtrasoGrave(statusTxt)) c.precoce = true;
        if (fat.bucket === "paga") { c.pagas++; if (diasPag != null) c.somaDiasPagamento += diasPag; }
        else if (fat.bucket === "pendente") c.pendentes++;
        else c.inadimplentes++;
      }
    }
    const arr = Array.from(m.values());
    for (const c of arr) c.prox = calcularProxVenc(c.faturas, hoje, carencia);
    arr.sort((a, b) => b.inadimplentes - a.inadimplentes || a.prox.dias - b.prox.dias);
    let pg = 0, pe = 0, ina = 0, tot = 0, somaDias = 0, qtdPagas = 0;
    for (const c of arr) { pg += c.pagas; pe += c.pendentes; ina += c.inadimplentes; tot += c.faturas.length; somaDias += c.somaDiasPagamento; qtdPagas += c.pagas; }
    const semVenda = arr.filter(c => !c.matched);
    return {
      clientes: arr, totFat: tot, semVenda, pagas: pg, pendentes: pe, inadimplentes: ina,
      totalClientes: arr.length, clientesMatched: arr.length - semVenda.length,
      custPreencher: arr.filter(c => c.matched && c.custcodeNovo).length,
      somaDiasPagamento: somaDias, mediaDiasPagamento: qtdPagas > 0 ? Math.round(somaDias / qtdPagas) : 0,
    };
  }, [colsOk, dados, mapCols, carencia, porOrdem]);

  const lista = useMemo(() => {
    let arr = res.clientes;
    if (filtro === "sem_venda") arr = arr.filter(c => !c.matched);
    else if (filtro === "paga") arr = arr.filter(c => c.pagas > 0);
    else if (filtro === "pendente") arr = arr.filter(c => c.pendentes > 0);
    else if (filtro === "inadimplente") arr = arr.filter(c => c.inadimplentes > 0);
    const b = busca.trim().toLowerCase();
    if (b) arr = arr.filter(c => c.ordem.toLowerCase().includes(b) || c.custcode.toLowerCase().includes(b) || c.nome.toLowerCase().includes(b));
    return arr;
  }, [res, filtro, busca]);
  const totalPag = Math.max(1, Math.ceil(lista.length / SIZE));
  const listaPag = useMemo(() => lista.slice((pagina - 1) * SIZE, pagina * SIZE), [lista, pagina]);
  useEffect(() => { setPagina(1); }, [filtro, busca, res.totFat]);

  // ─── gravar ────────────────────────────────────────────────────────────────
  const gravar = async () => {
    if (faltaTabela) { setFeedback({ tipo: "erro", titulo: "Tabela faltando", msg: "A tabela faturas_status não existe. Rode o SQL de setup primeiro." }); return; }
    const matched = res.clientes.filter(c => c.matched && c.proposta);
    if (matched.length === 0) { setFeedback({ tipo: "aviso", titulo: "Nada pra gravar", msg: "Nenhuma ordem casou com uma venda do CRM (dados_customizados.os)." }); return; }

    // 🛡️ Pré-checagem: a coluna NÚMERO FATURA foi mapeada? Sem ela, todas as faturas
    //    seriam puladas e a tela de Cobrança ficaria vazia. Avisa ANTES de gravar.
    if (mapCols.numero_fatura < 0) {
      setFeedback({ tipo: "erro", titulo: "Coluna 'Número da fatura' não mapeada", msg: "Sem essa coluna, nenhuma fatura é gravada (a Cobrança usa o número da fatura). Vá no passo 2 e selecione a coluna NÚMERO FATURA da planilha antes de gravar." });
      return;
    }

    setGravando(true);
    try {
      let custOk = 0;
      let instOk = 0;

      // 1) CUSTCODE — só de quem realmente mudou (geralmente poucos). Em lotes paralelos.
      const custUpdates = matched
        .filter(c => c.custcodeNovo && c.custcode)
        .map(c => ({ id: c.proposta!.id, dados: { ...(c.proposta!.dados_customizados || {}), custcode: c.custcode } }));
      const LOTE = 25;
      for (let i = 0; i < custUpdates.length; i += LOTE) {
        const lote = custUpdates.slice(i, i + LOTE);
        const rs = await Promise.all(lote.map(u => supabase.from("proposta").update({ dados_customizados: u.dados }).eq("id", u.id)));
        custOk += rs.filter(r => !r.error).length;
      }

      // 2) DATA_INSTALACAO = mês gross. Como só há ~9 meses distintos, agrupamos por mês
      //    e fazemos UM update por mês com .in("id", [...]) — 9 chamadas em vez de 2.000.
      const porMes = new Map<string, number[]>();
      for (const c of matched) {
        const mg = c.faturas.map((f: any) => f.mesGross).find(Boolean) || null;
        if (!mg) continue;
        const instCorreta = `${String(mg).slice(0, 7)}-01`;
        const instAtual = String(c.proposta!.data_instalacao || "").slice(0, 10);
        if (instCorreta === instAtual) continue; // já está certo
        const arr = porMes.get(instCorreta) || [];
        arr.push(c.proposta!.id);
        porMes.set(instCorreta, arr);
      }
      for (const [data, ids] of porMes) {
        // .in() aguenta listas grandes, mas quebramos em blocos de 300 ids por garantia
        for (let i = 0; i < ids.length; i += 300) {
          const bloco = ids.slice(i, i + 300);
          const { error } = await supabase.from("proposta").update({ data_instalacao: data }).in("id", bloco);
          if (!error) instOk += bloco.length;
        }
      }

      // 🆕 Grava CADA fatura da planilha (1..10), não agrupa mais por mês.
      //    Chave de upsert = (proposta_id, numero_fatura) — ver SQL cobranca_faturas_extra.
      const payload: any[] = [];
      let semNumero = 0;
      for (const c of matched) {
        const vistos = new Set<number>();
        for (const f of c.faturas) {
          if (f.numeroFatura == null) { semNumero++; continue; }   // sem nº de fatura → não dá pra gravar por fatura
          if (vistos.has(f.numeroFatura)) continue;                // 1 linha por número de fatura
          vistos.add(f.numeroFatura);
          payload.push({
            proposta_id: c.proposta!.id,
            numero_fatura: f.numeroFatura,
            numero_referencia: f.ref || `fat-${f.numeroFatura}`, // mantém a coluna antiga preenchida
            status: f.status,
            codigo_status: f.codigo,
            status_planilha: f.statusPlanilha,
            detalhamento: f.detalhamento,
            data_vencimento: f.venc ? f.venc.toISOString().slice(0, 10) : null,
            data_pagamento: f.pag,
            mes_gross: f.mesGross,
            observacao: f.observacao,
            suspensao_fraude: f.suspensaoFraude,
            churn: f.churn,
            insucesso_dacc: f.insucessoDacc,
            nome_banco: f.nomeBanco,
            opcao_pagamento: f.opcaoPagamento,
            atualizado_por: userEmail || null,
          });
        }
      }

      // 🛡️ Nada pra gravar mesmo tendo clientes casados = a planilha não trouxe número de fatura.
      if (payload.length === 0) {
        setGravando(false);
        setFeedback({ tipo: "erro", titulo: "Nenhuma fatura com número", msg: `${matched.length} cliente(s) casaram com o CRM, mas nenhuma linha tinha NÚMERO FATURA preenchido (${semNumero} linha(s) sem número). Confira no passo 2 se a coluna 'Número da fatura' aponta pra coluna certa da planilha.` });
        return;
      }

      // 🆕 Grava em lotes. AGORA o erro do upsert NÃO é engolido — para no 1º e mostra.
      let fatOk = 0;
      let primeiroErro: string | null = null;
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await supabase.from("faturas_status").upsert(chunk, { onConflict: "proposta_id,numero_fatura" });
        if (error) {
          primeiroErro = `${error.code ? `[${error.code}] ` : ""}${error.message}${(error as any).hint ? ` — ${(error as any).hint}` : ""}`;
          break;
        }
        fatOk += chunk.length;
      }

      if (primeiroErro) {
        setGravando(false);
        setFeedback({ tipo: "erro", titulo: "O banco recusou a gravação", msg: `Gravou ${fatOk} antes de falhar. Erro: ${primeiroErro}` });
        return;
      }

      setFeedback({ tipo: "ok", titulo: "Cobrança atualizada!", msg: `${fatOk} fatura(s) em ${matched.length} cliente(s). ${custOk} custcode(s) preenchido(s). ${instOk} data(s) de instalação corrigida(s).${semNumero > 0 ? ` ${semNumero} linha(s) sem número de fatura ignorada(s).` : ""}${res.semVenda.length > 0 ? ` ${res.semVenda.length} ordem(ns) sem venda no CRM.` : ""}` });
    } catch (e: any) {
      setFeedback({ tipo: "erro", titulo: "Erro ao gravar", msg: e?.message || "Falha inesperada." });
    }
    setGravando(false);
  };

  // ─── render ────────────────────────────────────────────────────────────────
  if (permitido === null || loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#6b7280" }}>Carregando...</div>;
  if (!permitido) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}><div style={{ ...card, padding: 48, textAlign: "center" }}><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700 }}>Acesso restrito</h1></div></div>;

  const temPlanilha = linhas.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}><span style={{ filter: "saturate(0) brightness(2)" }}>📤</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>Atualização de Faturas</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Suba a planilha de status — atualiza pago/pendente/inadimplente e puxa o custcode pela ordem</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/crm/cobranca/dashboard")} style={btnSec}>📊 Dashboard</button>
          <button onClick={() => router.push("/crm/cobranca")} style={btnSec}>← Cobrança</button>
        </div>
      </div>

      {faltaTabela && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 12, padding: "12px 18px", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>⚠️ A tabela <b>faturas_status</b> não existe. Rode o SQL de setup da Cobrança pra liberar a gravação.</div>}

      {feedback && (
        <div style={{ background: feedback.tipo === "ok" ? "#f0fdf4" : feedback.tipo === "erro" ? "#fef2f2" : "#fffbeb", border: `1px solid ${feedback.tipo === "ok" ? "#bbf7d0" : feedback.tipo === "erro" ? "#fecaca" : "#fde68a"}`, borderLeft: `4px solid ${feedback.tipo === "ok" ? "#16a34a" : feedback.tipo === "erro" ? "#dc2626" : "#d97706"}`, borderRadius: 12, padding: "12px 18px", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ color: feedback.tipo === "ok" ? "#15803d" : feedback.tipo === "erro" ? "#991b1b" : "#92400e", fontSize: 13.5, margin: 0, fontWeight: 700 }}>{feedback.titulo}</p>
            <p style={{ color: feedback.tipo === "ok" ? "#16a34a" : feedback.tipo === "erro" ? "#dc2626" : "#b45309", fontSize: 12, margin: "2px 0 0" }}>{feedback.msg}</p>
          </div>
          <button onClick={() => setFeedback(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "#9ca3af" }}>✕</button>
        </div>
      )}

      {/* 1. upload */}
      <div style={{ ...card, padding: isMobile ? 16 : 22 }}>
        <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>1. Suba a planilha de status das faturas</h3>
        <p style={{ color: "#6b7280", fontSize: 12.5, margin: "0 0 14px" }}>Acha o cliente pela <b>ordem de serviço</b> e puxa o <b>custcode</b> sozinho. Aceita .xlsx, .xls, .csv.</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onArquivo} style={{ display: "none" }} />
        <div style={{ border: "2px dashed #93c5fd", borderRadius: 12, padding: 24, textAlign: "center", background: "#eff6ff", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>📤</div>
          <p style={{ color: "#2563eb", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{nomeArquivo || "Clique pra escolher um arquivo"}</p>
          <p style={{ color: "#3b82f6", fontSize: 12, margin: 0 }}>{temPlanilha ? `${formatNum(dados.length)} linha(s) carregada(s)` : "Aceita .xlsx, .xls, .csv"}</p>
        </div>
        {temPlanilha && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "#374151", fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={temCabecalho} onChange={e => setTemCabecalho(e.target.checked)} style={{ accentColor: "#2563eb" }} /> Primeira linha é o cabeçalho
          </label>
        )}
      </div>

      {/* 2. mapeamento */}
      {temPlanilha && (
        <div style={{ ...card, padding: isMobile ? 16 : 22 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>2. Confira as colunas</h3>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: "0 0 16px" }}>Auto-detectei pelo nome. Ajuste se precisar.</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {DETECTAR.map(d => {
              const idx = mapCols[d.key]; const ok = idx >= 0;
              return (
                <div key={d.key}>
                  <label style={label}>{d.label}{d.obrig && <span style={{ color: "#dc2626" }}> *</span>}</label>
                  <select value={idx} onChange={e => setMapCols(m => ({ ...m, [d.key]: Number(e.target.value) }))} style={{ ...input, width: "100%", borderColor: ok || !d.obrig ? "#e5e7eb" : "#fecaca" }}>
                    <option value={-1}>— não usar —</option>
                    {cabecalhos.map((h: string, i: number) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <label style={label}>⏱️ Carência extra</label>
            <input type="number" min={0} value={carencia} onChange={e => setCarencia(Math.max(0, parseInt(e.target.value) || 0))} style={{ ...input, width: 80 }} />
            <span style={{ color: "#6b7280", fontSize: 12 }}>dias além do próximo vencimento antes de virar <b style={{ color: "#dc2626" }}>inadimplente</b></span>
          </div>
          {!colsOk && <p style={{ color: "#dc2626", fontSize: 12, margin: "12px 0 0", fontWeight: 600 }}>⚠️ Faltam colunas obrigatórias (*).</p>}
        </div>
      )}

      {/* 3. resultado */}
      {colsOk && res.totFat > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14 }}>
            {([
              { k: "paga" as const, qtd: res.pagas },
              { k: "pendente" as const, qtd: res.pendentes },
              { k: "inadimplente" as const, qtd: res.inadimplentes },
            ]).map(c => {
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

          {/* matching + gravar */}
          <div style={{ ...card, padding: isMobile ? 16 : 20, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 14, alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div><p style={{ color: "#9ca3af", fontSize: 11, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Casaram c/ CRM</p><p style={{ color: "#16a34a", fontSize: 20, fontWeight: 800, margin: "2px 0 0" }}>{formatNum(res.clientesMatched)}<span style={{ color: "#9ca3af", fontSize: 13 }}> / {formatNum(res.totalClientes)}</span></p></div>
              <div><p style={{ color: "#9ca3af", fontSize: 11, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Custcodes a preencher</p><p style={{ color: "#2563eb", fontSize: 20, fontWeight: 800, margin: "2px 0 0" }}>{formatNum(res.custPreencher)}</p></div>
              {res.semVenda.length > 0 && <div><p style={{ color: "#9ca3af", fontSize: 11, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Ordens sem venda</p><p style={{ color: "#dc2626", fontSize: 20, fontWeight: 800, margin: "2px 0 0" }}>{formatNum(res.semVenda.length)}</p></div>}
            </div>
            <button onClick={gravar} disabled={gravando} style={{ ...btnPri, opacity: gravando ? 0.6 : 1, cursor: gravando ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>{gravando ? "⏳ Gravando..." : "💾 Atualizar faturas no sistema"}</button>
          </div>

          {/* tabela: nome | custcode | dias p/ próximo vencimento */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>👥 Clientes ({formatNum(lista.length)})</h3>
              <input placeholder="🔍 ordem, custcode ou nome..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...input, marginLeft: "auto", padding: "7px 12px", fontSize: 12, borderRadius: 20, width: isMobile ? "100%" : 260 }} />
            </div>
            <div style={{ padding: "10px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([{ k: "todos", l: "Todos" }, { k: "inadimplente", l: "🔴 Inadimplentes" }, { k: "pendente", l: "⏳ Pendentes" }, { k: "paga", l: "✅ Pagas" }, { k: "sem_venda", l: "❓ Sem venda" }] as { k: typeof filtro; l: string }[]).map(f => (
                <button key={f.k} onClick={() => setFiltro(f.k)} style={{ borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, border: `1px solid ${filtro === f.k ? "#2563eb" : "#e5e7eb"}`, background: filtro === f.k ? "#eff6ff" : "#fff", color: filtro === f.k ? "#2563eb" : "#6b7280" }}>{f.l}</button>
              ))}
            </div>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 820 : "auto" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Cliente", "CUSTCODE", "Próximo vencimento", "Ordem", "Fat.", "✅", "⏳", "🔴"].map(h => (
                      <th key={h} style={{ padding: "11px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listaPag.map((c, i) => {
                    const rp = rotuloProx(c.prox);
                    return (
                      <tr key={c.ordem} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ padding: "11px 14px", maxWidth: 200 }}>
                          <div style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
                          {!c.matched && <span style={{ color: "#dc2626", fontSize: 10.5, fontWeight: 600 }}>❓ sem venda no CRM</span>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 12.5, color: c.custcode ? "#1f2937" : "#9ca3af", fontWeight: 700, background: c.custcodeNovo ? "#eff6ff" : "transparent", border: c.custcodeNovo ? "1px solid #bfdbfe" : "1px solid transparent", borderRadius: 6, padding: "2px 7px" }}>{c.custcode || "—"}</span>
                          {c.custcodeNovo && <span style={{ color: "#2563eb", fontSize: 10, fontWeight: 700, marginLeft: 4 }}>novo</span>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ background: rp.bg, color: rp.cor, border: `1px solid ${rp.border}`, fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{rp.texto}</span>
                        </td>
                        <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{c.ordem}</td>
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
        </>
      )}

      {!temPlanilha && (
        <div style={{ ...card, padding: 44, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📤</div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Suba a planilha pra começar</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>O resultado aparece aqui assim que você carregar o arquivo.</p>
        </div>
      )}
    </div>
  );
}