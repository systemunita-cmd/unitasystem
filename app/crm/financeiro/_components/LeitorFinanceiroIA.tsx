"use client";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export function LeitorFinanceiroIA() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dados, setDados] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [lendo, setLendo] = useState(false);
  const ler = async () => {
    if (!arquivo) return;
    setLendo(true); setMsg("");
    const fd = new FormData(); fd.append("arquivo", arquivo);
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token;
    if (!token) { setLendo(false); return setMsg("Sessão expirada. Entre novamente."); }
    const r = await fetch("/api/financeiro/ler-documento", { method: "POST", body: fd, headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json(); setLendo(false);
    if (!r.ok) return setMsg(j.error || "Falha na leitura.");
    setDados(j.dados);
  };
  const lancar = async () => {
    if (!dados || !arquivo) return;
    const { data: titulo, error } = await supabase.from("fin_titulos").insert({
      tipo: "pagar", descricao: dados.descricao || `Documento ${dados.documento || ""}`,
      parte: dados.fornecedor, valor: dados.valor || 0, vencimento: dados.vencimento,
      competencia: (dados.emissao || dados.vencimento || new Date().toISOString()).slice(0, 7),
      categoria: dados.categoria_sugerida || "Outro", status: "pendente",
      origem_modulo: "IA", origem_tipo: dados.tipo_documento || "documento",
      metadata: { ia_documento: dados, arquivo: arquivo.name, exige_conferencia: true },
    }).select("id").single();
    if (error || !titulo) return setMsg(error?.message || "Não foi possível criar o lançamento.");
    const caminho = `${titulo.id}/${crypto.randomUUID()}-${arquivo.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const envio = await supabase.storage.from("financeiro-anexos").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (!envio.error) {
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("fin_titulo_anexos").insert({ titulo_id: titulo.id, nome: arquivo.name, tipo_mime: arquivo.type, tamanho_bytes: arquivo.size, storage_path: caminho, enviado_por: auth.user?.email });
    }
    setMsg(envio.error ? `Lançamento criado, mas o anexo falhou: ${envio.error.message}` : "Lançamento e documento criados para conferência.");
  };
  return <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:18}}>
    <h3>Leitura automática de boletos e notas</h3>
    <p style={{fontSize:12,color:"#64748b"}}>A IA extrai fornecedor, valor, vencimento e categoria. O lançamento fica pendente para conferência.</p>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setArquivo(e.target.files?.[0]||null)}/>
    <button onClick={ler} disabled={!arquivo||lendo} style={{marginLeft:8,padding:"8px 12px",background:"#d97706",color:"#fff",border:0,borderRadius:8}}>{lendo?"Lendo...":"Ler com IA"}</button>
    {dados&&<div style={{marginTop:14,fontSize:12}}><pre style={{whiteSpace:"pre-wrap",background:"#f8fafc",padding:10}}>{JSON.stringify(dados,null,2)}</pre><button onClick={lancar}>Criar lançamento</button></div>}
    {msg&&<p style={{fontSize:11}}>{msg}</p>}
  </div>;
}
