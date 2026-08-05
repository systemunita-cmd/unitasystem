"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type PlanoBanco = { id?: string; plano: string; plano_chave?: string; valor_comissao: number; ativo: boolean };
type Props = { competencia: string; podeEditar: boolean; onMensagem: (mensagem: string) => void; onAtualizar: () => void };

const normalizar = (valor: string) => valor.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR").replace(/GLOBO PLAY/g, "GLOBOPLAY").replace(/PARAMOUNT\+/g, "PARAMOUNT").replace(/ MEGAS/g, " MEGA").replace(/ MB/g, " MEGA").replace(/ GB/g, " GIGA").replace(/ COM /g, " ").replace(/\s*\+\s*/g, " ").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const dinheiro = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ConfiguracaoComissaoPlanos({ competencia, podeEditar, onMensagem, onAtualizar }: Props) {
  const [planosAtivos, setPlanosAtivos] = useState<string[]>([]);
  const [configuracoes, setConfiguracoes] = useState<PlanoBanco[]>([]);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    const [campo, camposCustomizados, configurados, usados] = await Promise.all([
      supabase.from("proposta_campos_padrao_config").select("opcoes").eq("campo_slug", "plano").maybeSingle(),
      supabase.from("proposta_campos_customizados").select("slug,label,opcoes,ativo").eq("ativo", true),
      supabase.from("fin_comissao_planos").select("id,plano,plano_chave,valor_comissao,ativo").order("plano"),
      supabase.from("proposta").select("plano").not("plano", "is", null).limit(5000),
    ]);
    const opcoesFixas = Array.isArray(campo.data?.opcoes) ? campo.data.opcoes.map(String).filter(Boolean) : [];
    const opcoesCustomizadas = (camposCustomizados.data || []).filter((item: any) => /plano/i.test(`${item.slug || ""} ${item.label || ""}`)).flatMap((item: any) => Array.isArray(item.opcoes) ? item.opcoes.map(String) : []);
    const opcoes = Array.from(new Set([...opcoesFixas, ...opcoesCustomizadas].map(item => item.trim()).filter(Boolean)));
    const historicos = Array.from(new Set((usados.data || []).map((item: any) => String(item.plano || "").trim()).filter(Boolean)));
    const ativos = opcoes.length ? opcoes : historicos;
    const banco = (configurados.data || []).map((item: any) => ({ ...item, valor_comissao: Number(item.valor_comissao) || 0 })) as PlanoBanco[];
    const mapa: Record<string, number> = {};
    banco.forEach(item => { mapa[normalizar(item.plano)] = item.valor_comissao; });
    ativos.forEach(plano => { mapa[normalizar(plano)] ??= 0; });
    setPlanosAtivos(ativos);
    setConfiguracoes(banco);
    setValores(mapa);
    if (configurados.error && configurados.error.code !== "PGRST205") onMensagem(configurados.error.message);
  };

  useEffect(() => { carregar(); }, []);

  const linhas = useMemo(() => {
    const ativos = planosAtivos.map(plano => ({ plano, ativoNoCadastro: true }));
    const chaves = new Set(ativos.map(item => normalizar(item.plano)));
    const historicos = configuracoes.filter(item => !chaves.has(normalizar(item.plano))).map(item => ({ plano: item.plano, ativoNoCadastro: false }));
    return [...ativos, ...historicos].sort((a, b) => Number(b.ativoNoCadastro) - Number(a.ativoNoCadastro) || a.plano.localeCompare(b.plano, "pt-BR"));
  }, [planosAtivos, configuracoes]);

  const salvar = async () => {
    if (!podeEditar) return;
    setSalvando(true);
    for (const linha of linhas) {
      const { error } = await supabase.rpc("salvar_fin_comissao_plano", {
        p_plano: linha.plano,
        p_valor: Number(valores[normalizar(linha.plano)] || 0),
        p_ativo: linha.ativoNoCadastro,
      });
      if (error) {
        onMensagem(error.message);
        setSalvando(false);
        return;
      }
    }
    const sincronizacao = await supabase.rpc("sincronizar_financeiro_rh", { p_competencia: competencia });
    onMensagem(sincronizacao.error ? sincronizacao.error.message : "Comissões por plano salvas e folha recalculada.");
    setSalvando(false);
    await carregar();
    onAtualizar();
  };

  const preenchidos = linhas.filter(item => item.ativoNoCadastro && Number(valores[normalizar(item.plano)] || 0) > 0).length;
  return <section style={{ background: "#fff", border: "1px solid #dcebe2", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 24px rgba(54,95,75,.07)" }}>
    <button onClick={() => setAberto(valor => !valor)} style={{ width: "100%", padding: "17px 19px", border: 0, background: "linear-gradient(135deg,#f3f8f5,#fff)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}>
      <span><b style={{ display: "block", color: "#365314", fontSize: 14 }}>Tabela padrão de comissão por plano</b><small style={{ color: "#64748b" }}>Planos ativos vêm automaticamente da configuração da aba Vendas · Planos.</small></span>
      <span style={{ background: "#e6f1eb", color: "#294c3b", borderRadius: 999, padding: "7px 11px", fontSize: 11, fontWeight: 900 }}>{preenchidos}/{planosAtivos.length} configurados · {aberto ? "Fechar" : "Editar"}</span>
    </button>
    {aberto && <div style={{ padding: 18, borderTop: "1px solid #e6f1eb" }}>
      {!podeEditar && <p style={{ margin: "0 0 12px", padding: 10, borderRadius: 10, background: "#f8fafc", color: "#64748b", fontSize: 11 }}>Somente administradores podem alterar os valores. A tabela continua visível para conferência.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 9 }}>
        {linhas.map(item => { const chave = normalizar(item.plano); return <label key={chave} style={{ display: "grid", gridTemplateColumns: "1fr 115px", gap: 10, alignItems: "center", padding: 11, border: `1px solid ${item.ativoNoCadastro ? "#dcebe2" : "#e2e8f0"}`, borderRadius: 12, background: item.ativoNoCadastro ? "#f8fbf9" : "#f8fafc", opacity: item.ativoNoCadastro ? 1 : .65 }}>
          <span style={{ minWidth: 0 }}><b style={{ display: "block", color: "#1e293b", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.plano}</b><small style={{ color: item.ativoNoCadastro ? "#5b8f74" : "#94a3b8" }}>{item.ativoNoCadastro ? "Plano ativo" : "Plano histórico/inativo"}</small></span>
          <span style={{ position: "relative" }}><span style={{ position: "absolute", left: 9, top: 10, color: "#365f4b", fontSize: 10, fontWeight: 800 }}>R$</span><input disabled={!podeEditar || !item.ativoNoCadastro} type="number" min="0" step="0.01" value={valores[chave] ?? 0} onChange={evento => setValores(atual => ({ ...atual, [chave]: Number(evento.target.value) }))} aria-label={`Comissão do plano ${item.plano}`} style={{ width: "100%", minHeight: 38, boxSizing: "border-box", border: "1px solid #bfd9ca", borderRadius: 9, padding: "8px 8px 8px 30px", background: podeEditar && item.ativoNoCadastro ? "#fff" : "#f1f5f9", fontSize: 11, fontWeight: 800 }} /></span>
        </label>; })}
      </div>
      {planosAtivos.length === 0 && <p style={{ color: "#64748b", fontSize: 12 }}>Nenhum plano foi configurado na aba Vendas · Planos. Cadastre os planos lá primeiro.</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}><small style={{ color: "#64748b" }}>Valor zero significa que o plano não gera comissão.</small>{podeEditar && <button disabled={salvando || planosAtivos.length === 0} onClick={salvar} style={{ minHeight: 42, border: "1px solid #365f4b", borderRadius: 10, padding: "10px 17px", background: "linear-gradient(180deg,#7fb095,#5b8f74)", color: "#fff", fontWeight: 900, cursor: "pointer", boxShadow: "0 2px 0 #294c3b" }}>{salvando ? "Salvando..." : `Salvar ${planosAtivos.length} planos`}</button>}</div>
      {preenchidos > 0 && <p style={{ margin: "10px 0 0", color: "#365f4b", fontSize: 10 }}>Total das configurações preenchidas: {dinheiro(linhas.filter(item => item.ativoNoCadastro).reduce((soma, item) => soma + Number(valores[normalizar(item.plano)] || 0), 0))}</p>}
    </div>}
  </section>;
}
