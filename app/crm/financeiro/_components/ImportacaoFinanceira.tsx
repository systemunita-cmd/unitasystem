"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase";

type Destino = "titulos" | "extratos";
type TipoPadrao = "automatico" | "receber" | "pagar";
type Mapeamento = {
  data: string; descricao: string; valor: string; entrada: string; saida: string;
  tipo: string; categoria: string; centroCusto: string; competencia: string;
};
type ItemNormalizado = {
  linha: number; data: string; descricao: string; valor: number;
  tipo: "receber" | "pagar"; categoria: string; centroCusto: string;
  competencia: string; valido: boolean; erro?: string;
};

const vazio: Mapeamento = { data: "", descricao: "", valor: "", entrada: "", saida: "", tipo: "", categoria: "", centroCusto: "", competencia: "" };
const campo = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 11px", minHeight: 42, background: "#fff", color: "#1e293b", fontSize: 12, width: "100%", boxSizing: "border-box" as const };
const verde = { border: "1px solid #4d7c0f", borderRadius: 10, padding: "10px 16px", minHeight: 42, background: "linear-gradient(180deg,#84cc16,#65a30d)", color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", boxShadow: "0 2px 0 #3f6212,0 7px 14px rgba(101,163,13,.18)" } as const;

const normal = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
function numero(valor: unknown) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor ?? "").trim();
  if (!texto) return 0;
  const negativo = /^\(.*\)$/.test(texto) || texto.startsWith("-");
  texto = texto.replace(/[()R$\s]/g, "").replace(/[^\d,.-]/g, "").replace(/-/g, "");
  const virgula = texto.lastIndexOf(","), ponto = texto.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) texto = virgula > ponto ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  else if (virgula >= 0) texto = texto.replace(/\./g, "").replace(",", ".");
  else if ((texto.match(/\./g) || []).length > 1) texto = texto.replace(/\./g, "");
  const n = Number(texto) || 0;
  return negativo ? -Math.abs(n) : n;
}

function dataIso(valor: unknown) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === "number" && valor > 20000) {
    const d = XLSX.SSF.parse_date_code(valor);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(valor ?? "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function competencia(valor: unknown, data: string, padrao: string) {
  const s = String(valor ?? "").trim();
  const anoMes = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (anoMes) return `${anoMes[1]}-${anoMes[2].padStart(2, "0")}`;
  const mesAno = s.match(/^(\d{1,2})[-/](\d{4})/);
  if (mesAno) return `${mesAno[2]}-${mesAno[1].padStart(2, "0")}`;
  return data?.slice(0, 7) || padrao;
}

function tipoDo(raw: unknown, valor: number, padrao: TipoPadrao): "receber" | "pagar" {
  if (padrao !== "automatico") return padrao;
  const t = normal(raw);
  if (["d", "debito", "debit", "saida", "pagar", "despesa"].includes(t) || t.includes("deb")) return "pagar";
  if (["c", "credito", "credit", "entrada", "receber", "receita"].includes(t) || t.includes("cred")) return "receber";
  return valor < 0 ? "pagar" : "receber";
}

function colunaAutomatica(colunas: string[], aliases: string[]) {
  return colunas.find(c => aliases.some(a => normal(c) === a || normal(c).includes(a))) || "";
}

async function lerArquivo(arquivo: File) {
  const ext = arquivo.name.split(".").pop()?.toLowerCase();
  if (ext === "ofx") {
    const texto = await arquivo.text();
    return (texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []).map(bloco => ({
      Data: bloco.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.slice(0, 8) || "",
      Descricao: bloco.match(/<(?:MEMO|NAME)>([^<\r\n]+)/i)?.[1] || "Movimento bancário",
      Valor: bloco.match(/<TRNAMT>([^<\r\n]+)/i)?.[1] || "0",
      Tipo: bloco.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1] || "",
    }));
  }
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: true, raw: true });
  const primeira = wb.SheetNames[0];
  if (!primeira) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[primeira], { defval: "", raw: true });
}

export function ImportacaoFinanceira({ competenciaPadrao, fechado, onImportado }: { competenciaPadrao: string; fechado: boolean; onImportado: (mensagem: string) => void }) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<Record<string, unknown>[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);
  const [mapa, setMapa] = useState<Mapeamento>(vazio);
  const [destino, setDestino] = useState<Destino>("titulos");
  const [tipoPadrao, setTipoPadrao] = useState<TipoPadrao>("automatico");
  const [status, setStatus] = useState<"pago" | "pendente">("pago");
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const escolher = async (f?: File) => {
    if (!f) return;
    setLendo(true); setMensagem(""); setArquivo(f);
    try {
      const dados = await lerArquivo(f);
      const cols = Array.from(new Set(dados.slice(0, 30).flatMap(r => Object.keys(r))));
      setLinhas(dados); setColunas(cols);
      setMapa({
        data: colunaAutomatica(cols, ["data", "date", "dtposted", "data movimento", "data lancamento"]),
        descricao: colunaAutomatica(cols, ["descricao", "historico", "memo", "name", "estabelecimento"]),
        valor: colunaAutomatica(cols, ["valor", "amount", "valor lancamento"]),
        entrada: colunaAutomatica(cols, ["entrada", "credito", "creditos", "valor credito"]),
        saida: colunaAutomatica(cols, ["saida", "debito", "debitos", "valor debito"]),
        tipo: colunaAutomatica(cols, ["tipo", "type", "natureza", "dc", "debito credito"]),
        categoria: colunaAutomatica(cols, ["categoria", "category", "classificacao"]),
        centroCusto: colunaAutomatica(cols, ["centro de custo", "centro_custo", "departamento"]),
        competencia: colunaAutomatica(cols, ["competencia", "mes referencia", "referencia"]),
      });
      setMensagem(dados.length ? `${dados.length} linha(s) lida(s). Confira o mapeamento antes de importar.` : "O arquivo não possui linhas de dados.");
    } catch (e: any) {
      setLinhas([]); setColunas([]); setMensagem(e?.message || "Não foi possível ler o arquivo.");
    } finally { setLendo(false); }
  };

  const itens = useMemo(() => {
    const resultado: ItemNormalizado[] = [];
    const valorDe = (r: Record<string, unknown>, c: string) => c ? r[c] : "";
    linhas.forEach((r, indice) => {
      const data = dataIso(valorDe(r, mapa.data));
      const descricao = String(valorDe(r, mapa.descricao) || "Movimento importado").trim();
      const base = { linha: indice + 2, data, descricao, categoria: String(valorDe(r, mapa.categoria) || "Outro").trim(), centroCusto: String(valorDe(r, mapa.centroCusto) || "").trim(), competencia: competencia(valorDe(r, mapa.competencia), data, competenciaPadrao) };
      const entrada = mapa.entrada ? Math.abs(numero(valorDe(r, mapa.entrada))) : 0;
      const saida = mapa.saida ? Math.abs(numero(valorDe(r, mapa.saida))) : 0;
      const adicionar = (valor: number, tipo: "receber" | "pagar") => resultado.push({ ...base, valor: Math.abs(valor), tipo, valido: !!data && Math.abs(valor) > 0, erro: !data ? "Data inválida" : Math.abs(valor) <= 0 ? "Valor zerado" : undefined });
      if (entrada > 0 || saida > 0) {
        if (entrada > 0) adicionar(entrada, "receber");
        if (saida > 0) adicionar(saida, "pagar");
      } else {
        const valor = numero(valorDe(r, mapa.valor));
        adicionar(valor, tipoDo(valorDe(r, mapa.tipo), valor, tipoPadrao));
      }
    });
    return resultado;
  }, [linhas, mapa, tipoPadrao, competenciaPadrao]);

  const validos = itens.filter(i => i.valido);
  const entradas = validos.filter(i => i.tipo === "receber").reduce((s, i) => s + i.valor, 0);
  const saidas = validos.filter(i => i.tipo === "pagar").reduce((s, i) => s + i.valor, 0);

  const importar = async () => {
    if (!arquivo || !validos.length) return setMensagem("Não existem linhas válidas para importar.");
    if (destino === "titulos" && fechado) return setMensagem("A competência selecionada está fechada. Reabra antes de importar lançamentos.");
    setImportando(true); setMensagem("");
    const competenciasDoArquivo = Array.from(new Set(validos.map(i => i.competencia).filter(Boolean)));
    const fechadas = competenciasDoArquivo.length
      ? await supabase.from("fin_competencias").select("competencia").in("competencia", competenciasDoArquivo).eq("status", "fechada")
      : { data: [], error: null };
    if (fechadas.error) { setMensagem(fechadas.error.message); setImportando(false); return; }
    if (fechadas.data?.length) {
      setMensagem(`Não foi possível importar: reabra as competências ${fechadas.data.map(x => x.competencia).join(", ")}.`);
      setImportando(false);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "arquivo";
    const imp = await supabase.from("fin_importacoes").insert({ nome_arquivo: arquivo.name, formato: ext, total_linhas: validos.length, importado_por: auth.user?.email }).select("id").single();
    if (imp.error) { setMensagem(imp.error.message); setImportando(false); return; }
    const registros = destino === "extratos"
      ? validos.map(i => ({ data: i.data, descricao: i.descricao, valor: i.valor, tipo: i.tipo === "receber" ? "credito" : "debito", importacao_id: imp.data.id }))
      : validos.map(i => ({ tipo: i.tipo, descricao: i.descricao, valor: i.valor, vencimento: i.data, pago_em: status === "pago" ? i.data : null, competencia: i.competencia, categoria: i.categoria || "Outro", centro_custo: i.centroCusto || null, status, observacao: `Importado de ${arquivo.name} · linha ${i.linha}`, origem_modulo: "IMPORTACAO", origem_tipo: ext, metadata: { importacao_id: imp.data.id, linha_arquivo: i.linha } }));
    let erro: any = null;
    for (let inicio = 0; inicio < registros.length; inicio += 300) {
      const r = await supabase.from(destino === "extratos" ? "fin_extratos" : "fin_titulos").insert(registros.slice(inicio, inicio + 300) as any[]);
      if (r.error) { erro = r.error; break; }
    }
    if (erro) {
      if (destino === "extratos") await supabase.from("fin_extratos").delete().eq("importacao_id", imp.data.id);
      else await supabase.from("fin_titulos").delete().contains("metadata", { importacao_id: imp.data.id });
      await supabase.from("fin_importacoes").delete().eq("id", imp.data.id);
      setMensagem(`A importação não foi concluída: ${erro.message}`);
    } else {
      const sucesso = `${validos.length} registro(s) importado(s): ${validos.filter(i => i.tipo === "receber").length} entrada(s) e ${validos.filter(i => i.tipo === "pagar").length} saída(s).`;
      setMensagem(sucesso);
      onImportado(sucesso);
      setArquivo(null); setLinhas([]); setColunas([]); setMapa(vazio);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
    setImportando(false);
  };

  const seletor = (rotulo: string, chave: keyof Mapeamento, ajuda?: string) => <label style={{ display: "grid", gap: 5, color: "#475569", fontSize: 10, fontWeight: 800 }}>
    {rotulo}<select value={mapa[chave]} onChange={e => setMapa(m => ({ ...m, [chave]: e.target.value }))} style={campo}><option value="">Não importar</option>{colunas.map(c => <option key={c} value={c}>{c}</option>)}</select>{ajuda && <small style={{ color: "#94a3b8", fontWeight: 500 }}>{ajuda}</small>}
  </label>;

  return <div style={{ display: "grid", gap: 16 }}>
    <section style={{ border: "1px dashed #a3e635", background: "linear-gradient(135deg,#fbfff4,#f7fee7)", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div><h3 style={{ margin: 0, color: "#1e293b", fontSize: 17 }}>1. Escolha o arquivo</h3><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 11 }}>CSV, XLS, XLSX ou OFX. Nada é salvo antes da confirmação.</p></div>
        <input ref={arquivoRef} type="file" accept=".csv,.xls,.xlsx,.ofx,text/csv" hidden onChange={e => escolher(e.target.files?.[0])}/>
        <button onClick={() => arquivoRef.current?.click()} disabled={lendo} style={verde}>{lendo ? "Lendo arquivo..." : arquivo ? "Trocar arquivo" : "Selecionar arquivo"}</button>
      </div>
      {arquivo && <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid #d9f99d", background: "#fff", borderRadius: 10, color: "#365314", fontSize: 12, fontWeight: 800 }}>{arquivo.name} · {linhas.length} linha(s)</div>}
    </section>

    {!!linhas.length && <>
      <section style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 16, padding: 20 }}>
        <h3 style={{ margin: "0 0 5px", fontSize: 17, color: "#1e293b" }}>2. Escolha o destino e as colunas</h3>
        <p style={{ margin: "0 0 15px", color: "#64748b", fontSize: 11 }}>Use “Lançamentos” para aparecer nas entradas, saídas e relatórios. Use “Extrato” somente para conciliação bancária.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12, marginBottom: 16 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569" }}>DESTINO<select value={destino} onChange={e => setDestino(e.target.value as Destino)} style={campo}><option value="titulos">Lançamentos financeiros — entradas e saídas</option><option value="extratos">Extrato bancário — conciliação</option></select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569" }}>INTERPRETAÇÃO DO TIPO<select value={tipoPadrao} onChange={e => setTipoPadrao(e.target.value as TipoPadrao)} style={campo}><option value="automatico">Automático pelo tipo/sinal</option><option value="receber">Todas as linhas são entradas</option><option value="pagar">Todas as linhas são saídas/despesas</option></select></label>
          {destino === "titulos" && <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569" }}>SITUAÇÃO<select value={status} onChange={e => setStatus(e.target.value as "pago" | "pendente")} style={campo}><option value="pago">Realizado — já entrou/saiu</option><option value="pendente">Previsto — ainda vai entrar/sair</option></select></label>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
          {seletor("DATA *", "data")}{seletor("DESCRIÇÃO", "descricao")}{seletor("VALOR", "valor", "Use se existe uma única coluna de valor")}{seletor("ENTRADA / CRÉDITO", "entrada", "Use quando entradas e saídas estão separadas")}{seletor("SAÍDA / DÉBITO", "saida")}{seletor("TIPO", "tipo")}{seletor("CATEGORIA", "categoria")}{seletor("CENTRO DE CUSTO", "centroCusto")}{seletor("COMPETÊNCIA", "competencia")}
        </div>
      </section>

      <section style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><h3 style={{ margin: 0, fontSize: 17, color: "#1e293b" }}>3. Confira e importe</h3><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 11 }}>{validos.length} válida(s) · {itens.length - validos.length} ignorada(s)</p></div><button onClick={importar} disabled={importando || !validos.length} style={{ ...verde, opacity: importando || !validos.length ? .55 : 1 }}>{importando ? "Importando..." : `Importar ${validos.length} registro(s)`}</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(140px,1fr))", gap: 10, margin: "15px 0" }}><div style={{ background: "#eff6ff", color: "#1d4ed8", padding: 12, borderRadius: 11 }}><small>ENTRADAS</small><b style={{ display: "block", marginTop: 4 }}>R$ {entradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></div><div style={{ background: "#fff1f2", color: "#be123c", padding: 12, borderRadius: 11 }}><small>SAÍDAS</small><b style={{ display: "block", marginTop: 4 }}>R$ {saidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></div><div style={{ background: "#f7fee7", color: "#3f6212", padding: 12, borderRadius: 11 }}><small>SALDO</small><b style={{ display: "block", marginTop: 4 }}>R$ {(entradas - saidas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></div></div>
        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 11 }}><thead><tr style={{ background: "#f8fafc" }}>{["Linha", "Data", "Descrição", "Tipo", "Valor", "Categoria", "Situação"].map(h => <th key={h} style={{ textAlign: "left", padding: 9, color: "#64748b" }}>{h}</th>)}</tr></thead><tbody>{itens.slice(0, 15).map((i, n) => <tr key={`${i.linha}-${n}`} style={{ borderTop: "1px solid #e2e8f0", opacity: i.valido ? 1 : .55 }}><td style={{ padding: 9 }}>{i.linha}</td><td style={{ padding: 9 }}>{i.data || "—"}</td><td style={{ padding: 9 }}>{i.descricao}</td><td style={{ padding: 9, color: i.tipo === "receber" ? "#15803d" : "#be123c", fontWeight: 800 }}>{i.tipo === "receber" ? "ENTRADA" : "SAÍDA"}</td><td style={{ padding: 9 }}>R$ {i.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td style={{ padding: 9 }}>{i.categoria}</td><td style={{ padding: 9, color: i.valido ? "#15803d" : "#be123c" }}>{i.valido ? "Pronta" : i.erro}</td></tr>)}</tbody></table></div>
        {itens.length > 15 && <p style={{ color: "#64748b", fontSize: 10 }}>Prévia das primeiras 15 linhas. Todas as {validos.length} linhas válidas serão importadas.</p>}
      </section>
    </>}
    {mensagem && <div style={{ border: `1px solid ${mensagem.includes("não") || mensagem.includes("inválid") ? "#fecaca" : "#bef264"}`, background: "#fff", borderRadius: 12, padding: "11px 13px", color: "#475569", fontSize: 12, fontWeight: 700 }}>{mensagem}</div>}
  </div>;
}
