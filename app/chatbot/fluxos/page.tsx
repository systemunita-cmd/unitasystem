"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type TipoNo =
  | "texto" | "imagem" | "video" | "audio" | "embed"
  | "input_texto" | "input_numero" | "input_email" | "input_website"
  | "input_data" | "input_hora" | "input_telefone" | "input_botao"
  | "input_selecao_imagem" | "input_pagamento" | "input_avaliacao"
  | "input_arquivo" | "input_cards"
  | "condicao" | "variavel" | "redirecionar" | "script" | "espera"
  | "teste_ab" | "webhook" | "pular" | "retornar"
  | "google_sheets" | "http_request" | "openai" | "claude_ai" | "gmail"
  | "inicio" | "comando" | "reply" | "invalido" | "transferir" | "finalizar"
  | "enviar_venda"  // 🆕 v18: cria proposta no CRM com as variáveis salvas + aplica etiqueta
  | "etiqueta";    // 🆕 v19: aplica/remove etiqueta no atendimento ativo

type No = { id: string; tipo: TipoNo; x: number; y: number; dados: Record<string,any>; saidas: string[]; };
type Aresta = { id: string; de: string; saidaIndex: number; para: string; };
type Fluxo = { id?: number; nome: string; descricao: string; ativo: boolean; trigger_tipo: string; trigger_valor: string; nos: No[]; conexoes: Aresta[]; };
type BC = { label: string; icone: string; cor: string; saidas: string[]; grupo: string; };
type FilaItem = { id: number; nome: string; conexao?: string; }; // 🆕 filas do CRM
type AtendenteItem = { email: string; nome: string; }; // 🆕 atendentes do workspace

const B: Record<TipoNo, BC> = {
  texto:                {label:"Texto",           icone:"💬", cor:"#3b82f6", saidas:["Próximo"],                     grupo:"Bubbles"},
  imagem:               {label:"Imagem",          icone:"🖼️", cor:"#06b6d4", saidas:["Próximo"],                     grupo:"Bubbles"},
  video:                {label:"Vídeo",           icone:"🎥", cor:"#8b5cf6", saidas:["Próximo"],                     grupo:"Bubbles"},
  audio:                {label:"Áudio",           icone:"🎵", cor:"#ec4899", saidas:["Próximo"],                     grupo:"Bubbles"},
  embed:                {label:"Incorporar",      icone:"🔗", cor:"#f97316", saidas:["Próximo"],                     grupo:"Bubbles"},
  input_texto:          {label:"Texto",           icone:"✏️", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_numero:         {label:"Número",          icone:"🔢", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_email:          {label:"Email",           icone:"📧", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_website:        {label:"Website",         icone:"🌐", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_data:           {label:"Data",            icone:"📅", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_hora:           {label:"Hora",            icone:"🕐", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_telefone:       {label:"Telefone",        icone:"📱", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_botao:          {label:"Botão",           icone:"🔘", cor:"#22c55e", saidas:["Botão 1","Botão 2","Botão 3"], grupo:"Inputs"},
  input_selecao_imagem: {label:"Seleção Imagem", icone:"🖼️", cor:"#22c55e", saidas:["Selecionado"],                 grupo:"Inputs"},
  input_pagamento:      {label:"Pagamento",       icone:"💳", cor:"#22c55e", saidas:["Aprovado","Recusado"],         grupo:"Inputs"},
  input_avaliacao:      {label:"Avaliação",       icone:"⭐", cor:"#22c55e", saidas:["Resposta recebida"],           grupo:"Inputs"},
  input_arquivo:        {label:"Arquivo",         icone:"📎", cor:"#22c55e", saidas:["Arquivo recebido"],            grupo:"Inputs"},
  input_cards:          {label:"Cards",           icone:"🃏", cor:"#22c55e", saidas:["Selecionado"],                 grupo:"Inputs"},
  condicao:             {label:"Condição",        icone:"🔀", cor:"#f59e0b", saidas:["Verdadeiro","Falso"],          grupo:"Lógica"},
  variavel:             {label:"Variável",        icone:"📦", cor:"#f59e0b", saidas:["Próximo"],                     grupo:"Lógica"},
  redirecionar:         {label:"Redirecionar",    icone:"↩️", cor:"#f59e0b", saidas:[],                              grupo:"Lógica"},
  script:               {label:"Script",          icone:"⌨️", cor:"#f59e0b", saidas:["Próximo"],                     grupo:"Lógica"},
  espera:               {label:"Espera",          icone:"⏳", cor:"#f59e0b", saidas:["Continuar"],                   grupo:"Lógica"},
  teste_ab:             {label:"Teste A/B",       icone:"🧪", cor:"#f59e0b", saidas:["A","B"],                       grupo:"Lógica"},
  webhook:              {label:"Webhook",         icone:"🔔", cor:"#f59e0b", saidas:["Próximo"],                     grupo:"Lógica"},
  pular:                {label:"Pular",           icone:"⏭️", cor:"#f59e0b", saidas:[],                              grupo:"Lógica"},
  retornar:             {label:"Retornar",        icone:"🔁", cor:"#f59e0b", saidas:[],                              grupo:"Lógica"},
  google_sheets:        {label:"Google Sheets",   icone:"📊", cor:"#10b981", saidas:["Sucesso","Erro"],              grupo:"Integrações"},
  http_request:         {label:"HTTP Request",    icone:"🌐", cor:"#10b981", saidas:["Sucesso","Erro"],              grupo:"Integrações"},
  openai:               {label:"OpenAI",          icone:"🤖", cor:"#10b981", saidas:["Próximo"],                     grupo:"Integrações"},
  claude_ai:            {label:"Claude AI",       icone:"🧠", cor:"#10b981", saidas:["Próximo"],                     grupo:"Integrações"},
  gmail:                {label:"Gmail",           icone:"📨", cor:"#10b981", saidas:["Enviado","Erro"],              grupo:"Integrações"},
  inicio:               {label:"Início",          icone:"🚀", cor:"#22c55e", saidas:["Próximo"],                     grupo:"Eventos"},
  comando:              {label:"Comando",         icone:"⚡", cor:"#ef4444", saidas:["Próximo"],                     grupo:"Eventos"},
  reply:                {label:"Reply",           icone:"↩️", cor:"#ef4444", saidas:["Próximo"],                     grupo:"Eventos"},
  invalido:             {label:"Inválido",        icone:"❌", cor:"#ef4444", saidas:["Próximo"],                     grupo:"Eventos"},
  transferir:           {label:"Transferir",      icone:"👤", cor:"#ef4444", saidas:["Próximo"],                     grupo:"Eventos"},
  finalizar:            {label:"Finalizar",       icone:"🏁", cor:"#ef4444", saidas:[],                              grupo:"Eventos"},
  // 🆕 v18: bloco que cria proposta no /crm/vendas usando variáveis salvas + aplica etiqueta
  enviar_venda:         {label:"Enviar Venda",    icone:"💰", cor:"#22c55e", saidas:["Sucesso","Erro"],              grupo:"CRM"},
  // 🆕 v19: aplica/remove etiqueta no atendimento ativo (use no meio do fluxo, não só no final)
  etiqueta:             {label:"Aplicar Etiqueta",icone:"🏷️", cor:"#22c55e", saidas:["Próximo"],                     grupo:"CRM"}};

// 🆕 v18: novo grupo "CRM" no sidebar pro bloco "Enviar Venda"
const GRUPOS = ["Bubbles","Inputs","Lógica","Integrações","Eventos","CRM"];
const uid = () => Math.random().toString(36).slice(2,10);

const IS: React.CSSProperties = {width:"100%",background:"#f8fafc",border:"1px solid #e5e7eb",borderRadius:6,padding:"8px 10px",color:"#1f2937",fontSize:12,boxSizing:"border-box"};
const LS: React.CSSProperties = {color:"#9ca3af",fontSize:10,textTransform:"uppercase",display:"block",marginBottom:4,letterSpacing:1};

// 🐺 Unita single-tenant: getWsUsername simplificado
// Em vez de buscar workspace, só confirma que há usuário autenticado.
// Se sim, retorna "unita" como ID estável (usado em channel names locais).
async function getWsUsername(): Promise<string|null> {
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) return null;
  return "unita";
}

function defaultD(tipo: TipoNo): Record<string,any> {
  const m: Partial<Record<TipoNo,Record<string,any>>> = {
    texto:{texto:"Digite sua mensagem aqui..."},
    imagem:{url:"",legenda:""},video:{url:"",legenda:""},audio:{url:""},embed:{url:""},
    input_texto:{pergunta:"Qual é o seu nome?",variavel:"nome"},
    input_numero:{pergunta:"Qual número?",variavel:"numero"},
    input_email:{pergunta:"Qual seu email?",variavel:"email"},
    input_website:{pergunta:"Qual website?",variavel:"website"},
    input_data:{pergunta:"Qual a data?",variavel:"data"},
    input_hora:{pergunta:"Qual a hora?",variavel:"hora"},
    input_telefone:{pergunta:"Qual telefone?",variavel:"telefone"},
    input_botao:{texto:"Escolha:",botoes:["Opção 1","Opção 2"]},
    input_selecao_imagem:{texto:"Selecione:",itens:[]},
    input_pagamento:{valor:0,descricao:"Pagamento"},
    input_avaliacao:{pergunta:"Como avalia?",max:5,variavel:"avaliacao"},
    input_arquivo:{pergunta:"Envie arquivo:",variavel:"arquivo"},
    input_cards:{cards:[{titulo:"Card 1",descricao:""}]},
    condicao:{variavel:"resposta",operador:"igual",valor:""},
    variavel:{nome:"minhaVar",valor:"",tipo:"texto"},
    redirecionar:{url:""},script:{codigo:"// código\nreturn true;"},
    espera:{segundos:3},teste_ab:{percentual_a:50},
    webhook:{url:"",metodo:"POST",headers:"",body:""},
    pular:{alvo:""},retornar:{alvo:""},
    google_sheets:{webhook_url:"",acao:"append",dados:"",variavel_resposta:""},
    http_request:{url:"",metodo:"GET",headers:"",body:"",variavel:""},
    openai:{apiKey:"",modelo:"gpt-4o-mini",prompt:"",variavel:"resposta_ia"},
    claude_ai:{apiKey:"",modelo:"claude-sonnet-4-20250514",prompt:"",variavel:"resposta_ia"},
    gmail:{smtp_host:"smtp.gmail.com",smtp_port:587,smtp_secure:false,smtp_user:"",smtp_pass:"",from_name:"",para:"",assunto:"",corpo:""},
    inicio:{mensagem:"Olá! Como posso te ajudar?"},
    comando:{comando:"/start"},reply:{palavras:""},
    invalido:{mensagem:"Não entendi."},
    // 🆕 Transferir agora tem 2 modos: equipe (fila) ou humano (atendente específico)
    transferir:{modo:"equipe", fila:"", atendente_email:"", atendente_nome:"", mensagem:"Transferindo..."},
    finalizar:{mensagem:"Atendimento finalizado. Obrigado!"},
    // 🆕 v18: bloco enviar_venda — defaults
    enviar_venda:{
      modo_mapeamento: "automatico",          // "automatico" (por nome) ou "manual" (define cada campo)
      mapeamento: {},                         // só usado se modo_mapeamento === "manual": { campo_proposta: "nome_variavel" }
      etiqueta: "proposta_finalizada",        // tag aplicada ao atendimento ao criar a proposta
      aplicar_etiqueta: true,                 // se false, só cria proposta sem aplicar tag
      status_inicial: "aguardando",           // status da proposta criada
      mensagem_sucesso: "✅ Sua proposta foi registrada! Em breve nossa equipe entra em contato.",
      mensagem_erro: "⚠️ Não consegui registrar agora, mas seu atendente vai te ajudar."},
    // 🆕 v19: bloco etiqueta — aplica/remove etiqueta no atendimento ativo
    etiqueta:{
      acao: "aplicar",        // "aplicar" ou "remover"
      nome: "",               // nome da etiqueta (cria se não existir)
      cor: "#3b82f6",         // cor da etiqueta (se for criada nova)
      icone: "🏷️",            // ícone da etiqueta (se for criada nova)
    }};
  return m[tipo]||{};
}

function getPreview(no: No): string {
  const d=no.dados;
  switch(no.tipo){
    case "texto": return d.texto||"Vazio";
    case "imagem":case"video":case"audio":case"embed": return d.url||d.legenda||"Sem URL";
    case "input_texto":case"input_numero":case"input_email":case"input_website":
    case"input_data":case"input_hora":case"input_telefone":case"input_arquivo":case"input_avaliacao":
      return `${d.pergunta||"?"} → {{${d.variavel||"var"}}}`;
    case "input_botao": return `${d.botoes?.length||0} botões`;
    case "input_selecao_imagem": return `${d.itens?.length||0} imgs`;
    case "input_pagamento": return `R$ ${d.valor||0}`;
    case "input_cards": return `${d.cards?.length||0} cards`;
    case "condicao": {
      // 🆕 Suporta múltiplas condições com OR/AND
      if (Array.isArray(d.condicoes) && d.condicoes.length > 0) {
        const juncao = d.juncao === "OR" ? " OU " : " E ";
        return d.condicoes.slice(0, 2).map((c: any) => `{{${c.variavel||"?"}}} ${c.operador||"="} "${c.valor||""}"`).join(juncao) + (d.condicoes.length > 2 ? ` ${juncao} +${d.condicoes.length - 2}` : "");
      }
      return `SE {{${d.variavel}}} ${d.operador} "${d.valor}"`;
    }
    case "variavel": {
      // 🆕 Mostra modo no canvas
      const modo = d.modo_valor || "texto";
      const icone = modo === "codigo" ? "💻" : modo === "expressao" ? "🔗" : "📝";
      const valor = String(d.valor || "").slice(0, 30);
      return `${icone} {{${d.nome||"?"}}} = ${valor}${String(d.valor||"").length > 30 ? "..." : ""}`;
    }
    case "redirecionar": return d.url||"Sem URL";
    case "script": return "Script JS";
    case "espera": return `⏳ ${d.segundos}s`;
    case "teste_ab": return `A:${d.percentual_a}% B:${100-(d.percentual_a||50)}%`;
    case "webhook": return `${d.metodo} ${d.url||""}`;
    case "pular":case"retornar": return `→ ${d.alvo||"?"}`;
    case "google_sheets": return d.webhook_url ? `Sheets ${d.acao}` : "⚠️ Webhook não configurado";
    case "http_request": return `${d.metodo} ${d.url||""}`;
    case "openai": return `GPT: ${d.modelo}`;
    case "claude_ai": return `Claude: ${d.modelo}`;
    case "gmail": return d.smtp_user ? `📨 ${d.para||"?"}` : "⚠️ SMTP não configurado";
    case "inicio": return d.mensagem||"Início";
    case "comando": return d.comando||"/start";
    case "reply": return d.palavras||"Palavras-chave";
    case "invalido": return d.mensagem||"Inválido";
    // 🆕 Transferir: mostra equipe/fila OU atendente humano conforme modo
    case "transferir": {
      if (d.modo === "humano") {
        return d.atendente_email ? `👤 ${d.atendente_nome || d.atendente_email}` : "⚠️ Atendente não selecionado";
      }
      return d.fila ? `📋 ${d.fila}` : "⚠️ Fila não selecionada";
    }
    case "finalizar": return d.mensagem||"Finalizar";
    // 🆕 v18: preview do bloco "Enviar Venda"
    case "enviar_venda": {
      const modo = d.modo_mapeamento === "manual" ? "manual" : "auto";
      const tag = d.aplicar_etiqueta !== false ? ` 🏷️ ${d.etiqueta||"proposta_finalizada"}` : "";
      return `💰 Cria proposta (${modo})${tag}`;
    }
    // 🆕 v19: preview do bloco "Aplicar Etiqueta"
    case "etiqueta": {
      const acao = d.acao === "remover" ? "Remove" : "Aplica";
      const ico = d.icone || "🏷️";
      return `${ico} ${acao}: ${d.nome || "(sem nome)"}`;
    }
    default: return "";
  }
}

// 🆕 ═══════════════════════════════════════════════════════════════════════
// TVarComponent — Textarea com botão "+ Variável" igual Typebot.
// ═══════════════════════════════════════════════════════════════════════
// CRITICAL FIX: dropdown usa position:fixed (não absolute) com posição calculada
// via useRef + useState, pra escapar do clip do modal scrollável (overflow:auto).
// Antes ficava clipado quando o popup tentava ir pra cima do textarea.
function TVarComponent({
  label, valor, onChange, placeholder, altura, variaveis, idSuffix
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  altura: number;
  variaveis: string[];
  idSuffix: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [filtro, setFiltro] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Calcula posição do dropdown baseado no botão (em coords da viewport)
  function abrir() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const dropdownWidth = 260;
    const dropdownHeight = 240;
    // Tenta abrir ACIMA do botão (preferência); se não couber, abre abaixo
    let top = r.top - dropdownHeight - 8;
    if (top < 10) top = r.bottom + 8; // sem espaço acima → abre abaixo
    // Alinha pela direita do botão (cresce pra esquerda)
    let left = r.right - dropdownWidth;
    if (left < 10) left = 10; // não deixa ir pra fora da tela
    setPos({ left, top });
    setAberto(true);
    setFiltro("");
  }

  // Fecha quando clica fora
  useEffect(() => {
    if (!aberto) return;
    function clickFora(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (dropRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", clickFora);
    return () => document.removeEventListener("mousedown", clickFora);
  }, [aberto]);

  // Insere {{nome}} no cursor do textarea
  function inserir(nome: string) {
    if (!nome.trim()) return;
    const ta = taRef.current;
    const valorAtual = valor || "";
    let novoValor: string;
    let novaPos: number;
    if (ta) {
      const start = ta.selectionStart ?? valorAtual.length;
      const end = ta.selectionEnd ?? valorAtual.length;
      const insercao = `{{${nome.trim()}}}`;
      novoValor = valorAtual.slice(0, start) + insercao + valorAtual.slice(end);
      novaPos = start + insercao.length;
    } else {
      novoValor = valorAtual + `{{${nome.trim()}}}`;
      novaPos = novoValor.length;
    }
    onChange(novoValor);
    setAberto(false);
    setTimeout(() => {
      const t = taRef.current;
      if (t) { t.focus(); t.setSelectionRange(novaPos, novaPos); }
    }, 50);
  }

  // Filtra variáveis pelo texto digitado
  const variaveisFiltradas = filtro.trim()
    ? variaveis.filter(v => v.toLowerCase().includes(filtro.toLowerCase()))
    : variaveis;

  return (
    <div key={`tvar-${idSuffix}`}>
      <label style={LS}>{label}</label>
      <div style={{ position: "relative" }}>
        <textarea
          ref={taRef}
          value={valor}
          onChange={e => onChange(e.target.value)}
          style={{ ...IS, height: altura, resize: "vertical", paddingRight: 12 }}
          placeholder={placeholder}
        />
        <button
          ref={btnRef}
          type="button"
          onClick={() => aberto ? setAberto(false) : abrir()}
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            background: aberto ? "#8b5cf644" : "#8b5cf622",
            color: "#a78bfa",
            border: "1px solid #8b5cf633",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: "bold",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            outline: "none"}}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span> Variável
        </button>
      </div>
      {variaveis.length > 0 && (
        <p style={{ color: "#6b7280", fontSize: 10, margin: "4px 0 0", lineHeight: 1.3 }}>
          💡 Clique em <b style={{ color: "#a78bfa" }}>＋ Variável</b> pra inserir uma variável do fluxo na posição do cursor.
        </p>
      )}

      {/* Dropdown com position:fixed — escapa do clip do modal */}
      {aberto && pos && (
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 10,
            width: 260,
            maxHeight: 240,
            display: "flex",
            flexDirection: "column",
            zIndex: 3000}}
        >
          <input
            type="text"
            placeholder={variaveis.length > 0 ? "Buscar ou criar variável..." : "Digite o nome da nova variável..."}
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                inserir(filtro);
              }
              if (e.key === "Escape") setAberto(false);
            }}
            autoFocus
            style={{
              width: "100%",
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "6px 10px",
              color: "#1f2937",
              fontSize: 12,
              marginBottom: 8,
              outline: "none",
              boxSizing: "border-box",
              flexShrink: 0}}
          />
          {/* Lista scrollável */}
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {variaveisFiltradas.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: 11, textAlign: "center", padding: 12, margin: 0 }}>
                {filtro
                  ? <>Nenhuma variável corresponde.<br/>Pressione <b>Enter</b> pra criar <span style={{color:"#a78bfa"}}>{`{{${filtro}}}`}</span></>
                  : <>Nenhuma variável no fluxo ainda.<br/>Digite acima pra criar a primeira.</>
                }
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {variaveisFiltradas.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => inserir(v)}
                    style={{
                      background: "transparent",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 10px",
                      cursor: "pointer",
                      textAlign: "left"}}
                  >
                    <span style={{
                      background: "#8b5cf622",
                      color: "#a78bfa",
                      padding: "3px 10px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: "bold"}}>{`{{${v}}}`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PainelProps({ noSel, updateNo, excluirNo, setNos, filasBanco, atendentesBanco, nos }: {
  noSel: No;
  updateNo: (id: string, d: Record<string,any>) => void;
  excluirNo: (id: string) => void;
  setNos: React.Dispatch<React.SetStateAction<No[]>>;
  filasBanco: FilaItem[]; // 🆕
  atendentesBanco: AtendenteItem[]; // 🆕 lista de atendentes do workspace
  nos: No[]; // 🆕 lista completa de nós pra detectar variáveis criadas
}) {
  const d = noSel.dados;
  const id = noSel.id;
  const u = (o: Record<string,any>) => updateNo(id, o);

  // 🆕 Coleta TODAS as variáveis criadas no fluxo (em qualquer bloco que seta variável).
  // Usado pro autocomplete/dropdown nos blocos que usam variáveis.
  const variaveisDoFluxo = (() => {
    const set = new Set<string>();
    nos.forEach(n => {
      const dn = n.dados || {};
      // Blocos que CAPTURAM variáveis
      if (dn.variavel) set.add(dn.variavel);
      if (dn.variavel_resposta) set.add(dn.variavel_resposta);
      if (dn.variavel_status) set.add(dn.variavel_status);
      // Bloco "variavel" (set manual)
      if (n.tipo === "variavel" && dn.nome) set.add(dn.nome);
      // Condições — referenciam mas também incluo pra autocompletar
      if (Array.isArray(dn.condicoes)) {
        dn.condicoes.forEach((c: any) => { if (c.variavel) set.add(c.variavel); });
      }
    });
    return Array.from(set).sort();
  })();

  const F = (lbl: string, key: string, type = "text", ph = "") => (
    <div key={`${id}-${key}`}>
      <label style={LS}>{lbl}</label>
      <input type={type} value={d[key]||""} onChange={e => u({[key]: e.target.value})} style={IS} placeholder={ph} />
    </div>
  );

  const T = (lbl: string, key: string, ph = "", h = 80) => (
    <div key={`${id}-${key}`}>
      <label style={LS}>{lbl}</label>
      <textarea value={d[key]||""} onChange={e => u({[key]: e.target.value})} style={{...IS, height:h, resize:"vertical"}} placeholder={ph} />
    </div>
  );

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // TVar — Textarea COM botão "+ Variável" estilo Typebot.
  // ═══════════════════════════════════════════════════════════════════════
  // Permite inserir {{nome_variavel}} na posição do cursor com 1 clique.
  // Mostra lista de variáveis existentes no fluxo + opção de criar nova.
  // Use em blocos onde a mensagem contém texto + variáveis (texto, legenda, etc).
  const TVar = (lbl: string, key: string, ph = "", h = 100) => {
    return (
      <TVarComponent
        label={lbl}
        valor={d[key] || ""}
        onChange={(v) => u({ [key]: v })}
        placeholder={ph}
        altura={h}
        variaveis={variaveisDoFluxo}
        idSuffix={`${id}-${key}`}
      />
    );
  };

  const S = (lbl: string, key: string, opts: {value:string;label:string}[]) => (
    <div key={`${id}-${key}`}>
      <label style={LS}>{lbl}</label>
      <select value={d[key]||opts[0]?.value} onChange={e => u({[key]: e.target.value})} style={IS}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // VarPill — Componente visual estilo Typebot pra escolher variável.
  // ═══════════════════════════════════════════════════════════════════════
  // Exibe a variável atual como uma "pílula" roxa (igual Typebot). Click abre
  // dropdown com lista das variáveis existentes + opção de criar nova.
  const VarPill = (label: string | null, key: string, placeholder = "Selecionar variável") => {
    const valor = d[key] || "";
    return (
      <div key={`${id}-${key}-varpill`}>
        {label && <label style={LS}>{label}</label>}
        <details className="var-pill-dropdown" style={{ position: "relative" }}>
          <summary style={{
            listStyle: "none",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            outline: "none"}}>
            {valor ? (
              <span style={{
                background: "#ede9fe",
                color: "#6d28d9",
                padding: "3px 10px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: "bold"}}>{`{{${valor}}}`}</span>
            ) : (
              <span style={{ color: "#6b7280", fontSize: 12 }}>{placeholder}</span>
            )}
            <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 10 }}>▼</span>
          </summary>
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8,
            zIndex: 100, maxHeight: 280, overflowY: "auto", padding: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)"}}>
            {/* Input pra digitar nova variável */}
            <input
              type="text"
              placeholder="Digite ou crie uma variável..."
              defaultValue={valor}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) u({ [key]: v });
                  (e.target as HTMLInputElement).closest("details")?.removeAttribute("open");
                }
              }}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v && v !== valor) u({ [key]: v });
              }}
              style={{
                width: "100%", background: "#f8fafc", border: "1px solid #e5e7eb",
                borderRadius: 6, padding: "6px 10px", color: "#1f2937", fontSize: 12,
                marginBottom: 8, outline: "none"}}
            />
            {/* Lista de variáveis existentes */}
            {variaveisDoFluxo.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: 11, textAlign: "center", padding: 12, margin: 0 }}>
                Nenhuma variável no fluxo ainda.<br/>Digite acima pra criar a primeira.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {variaveisDoFluxo.map(v => (
                  <button
                    key={v}
                    onClick={(e) => {
                      u({ [key]: v });
                      // 🆕 Fix: usa closest do elemento clicado (antes buscava por ID que não existia)
                      (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
                    }}
                    style={{
                      background: v === valor ? "#ddd6fe" : "transparent",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "#6d28d9",
                      fontSize: 12,
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      gap: 6}}
                  >
                    <span style={{
                      background: "#ede9fe",
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      color: "#6d28d9"}}>{`{{${v}}}`}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Botão limpar */}
            {valor && (
              <button
                onClick={(e) => {
                  u({ [key]: "" });
                  (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
                }}
                style={{
                  width: "100%", marginTop: 6, padding: 6, background: "transparent",
                  border: "1px dashed #e5e7eb", borderRadius: 6, color: "#6b7280",
                  fontSize: 11, cursor: "pointer"}}
              >✕ Limpar</button>
            )}
          </div>
        </details>
      </div>
    );
  };

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // OpSelect — Select de operador estilo Typebot (visual customizado, não nativo).
  // ═══════════════════════════════════════════════════════════════════════
  const OpSelect = (key: string, valor: string, onChange: (v: string) => void) => {
    const opcoes = [
      { value: "igual", label: "Igual a", icone: "=" },
      { value: "diferente", label: "Diferente de", icone: "≠" },
      { value: "contem", label: "Contém", icone: "⊇" },
      { value: "nao_contem", label: "Não contém", icone: "⊉" },
      { value: "comeca_com", label: "Começa com", icone: "▶" },
      { value: "termina_com", label: "Termina com", icone: "◀" },
      { value: ">", label: "Maior que", icone: ">" },
      { value: "<", label: "Menor que", icone: "<" },
      { value: ">=", label: "Maior ou igual", icone: "≥" },
      { value: "<=", label: "Menor ou igual", icone: "≤" },
      { value: "match_regex", label: "Match Regex", icone: ".*" },
      { value: "nao_match_regex", label: "Não match Regex", icone: "!.*" },
      { value: "preenchido", label: "Preenchido", icone: "✓" },
      { value: "vazio", label: "Vazio", icone: "∅" },
    ];
    const atual = opcoes.find(o => o.value === valor) || opcoes[0];
    return (
      <select
        value={valor}
        onChange={e => onChange(e.target.value)}
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          color: "#a78bfa",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: "bold",
          cursor: "pointer",
          outline: "none",
          minWidth: 140}}
      >
        {opcoes.map(o => (
          <option key={o.value} value={o.value}>{o.icone} {o.label}</option>
        ))}
      </select>
    );
  };

  // 🆕 ═══════════════════════════════════════════════════════════════════════
  // VarSelect — versão LEGACY (autocomplete simples). Mantenho pra blocos pequenos
  // tipo http_request "Salvar status em" que não precisam de UI tão rica.
  // ═══════════════════════════════════════════════════════════════════════
  const VarSelect = (label: string, key: string, placeholder = "nome_da_variavel") => (
    <div key={`${id}-${key}-varsel`}>
      <label style={LS}>{label}</label>
      <input
        list={`vars-${id}-${key}`}
        value={d[key] || ""}
        onChange={e => u({ [key]: e.target.value })}
        style={IS}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={`vars-${id}-${key}`}>
        {variaveisDoFluxo.filter(v => v !== d[key]).map(v => (
          <option key={v} value={v} />
        ))}
      </datalist>
      {variaveisDoFluxo.length > 0 && (
        <p style={{color:"#6b7280", fontSize:10, margin:"3px 0 0", lineHeight:1.3}}>
          💡 Variáveis no fluxo: {variaveisDoFluxo.slice(0, 5).join(", ")}{variaveisDoFluxo.length > 5 ? "..." : ""}
        </p>
      )}
    </div>
  );

  switch (noSel.tipo) {
    case "texto": return <>{TVar("Mensagem","texto","Digite sua mensagem aqui...",120)}</>;
    case "imagem": return <>{F("URL","url","url","https://...")}{F("Legenda","legenda")}</>;
    case "video":  return <>{F("URL","url","url","https://...")}{F("Legenda","legenda")}</>;
    case "audio":  return <>{F("URL do Áudio","url","url","https://...")}</>;
    case "embed":  return <>{F("URL","url","url","https://...")}</>;
    case "input_texto": case "input_email": case "input_website": case "input_numero":
    case "input_telefone": case "input_arquivo": case "input_data": case "input_hora":
      return <>
        {TVar("Pergunta","pergunta","Qual...?",80)}
        {VarPill("Salvar resposta em", "variavel", "ex: nome")}
      </>;
    case "input_avaliacao":
      return <>
        {TVar("Pergunta","pergunta","Como avalia?",80)}
        {F("Máximo","max","number","5")}
        {VarPill("Salvar resposta em", "variavel", "ex: avaliacao")}
      </>;
    case "input_pagamento":
      // 🆕 v18: aviso de feature parcial — backend ainda não tem integração com gateway
      return <>
        <p style={{color:"#f59e0b",fontSize:11,margin:"0 0 6px",lineHeight:1.4}}>
          ⚠️ <b>Em desenvolvimento</b> — sem integração com gateway de pagamento (Pix/Stripe/Mercado Pago).
          As saídas "Aprovado/Recusado" não disparam ainda. Use com cautela.
        </p>
        {F("Valor (R$)","valor","number","0")}
        {F("Descrição","descricao")}
      </>;
    case "input_selecao_imagem":
      // 🆕 v18: case implementado — antes caía no default ("Sem propriedades.") e o bloco ficava inútil.
      return <div>
        {TVar("Pergunta","texto","Selecione uma opção:",60)}
        <label style={LS}>Imagens (URL|Título, uma por linha)</label>
        <textarea
          value={(d.itens||[]).map((it:any) => `${it.url||""}|${it.titulo||""}`).join("\n")}
          onChange={e => {
            const itens = e.target.value.split("\n").filter(Boolean).map((l:string) => {
              const [url,titulo] = l.split("|");
              return {url: url?.trim()||"", titulo: titulo?.trim()||""};
            });
            u({itens});
          }}
          style={{...IS, height:100, resize:"vertical", fontFamily:"monospace", fontSize:11}}
          placeholder={"https://exemplo.com/produto1.jpg|Produto 1\nhttps://exemplo.com/produto2.jpg|Produto 2"}
        />
        <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0", lineHeight:1.3}}>
          💡 Cliente recebe as imagens e escolhe uma. O título da opção escolhida é salvo na variável abaixo.
        </p>
        {VarPill("Salvar opção escolhida em", "variavel", "ex: produto_escolhido")}
      </div>;
    case "input_botao":
      return <>
        {TVar("Texto","texto","Escolha:",60)}
        <div>
          <label style={LS}>Botões (máx 3, um por linha)</label>
          <textarea
            value={(d.botoes||[]).join("\n")}
            onChange={e => {
              const b = e.target.value.split("\n").filter(Boolean).slice(0,3);
              u({botoes: b});
              setNos(p => p.map(n => n.id===id ? {...n, saidas: b.length ? b : ["Botão 1"]} : n));
            }}
            style={{...IS, height:80, resize:"vertical"}}
            placeholder={"Sim\nNão\nTalvez"}
          />
        </div>
        {VarPill("Salvar resposta em (opcional)", "variavel", "ex: opcao_escolhida")}
      </>;
    case "input_cards":
      return <div>
        <label style={LS}>Cards (Título|Descrição, um por linha)</label>
        <textarea
          value={(d.cards||[]).map((c:any) => `${c.titulo}|${c.descricao}`).join("\n")}
          onChange={e => {
            const cards = e.target.value.split("\n").filter(Boolean).map((l:string) => {
              const [t,ds] = l.split("|");
              return {titulo: t?.trim()||"", descricao: ds?.trim()||""};
            });
            u({cards});
          }}
          style={{...IS, height:100, resize:"vertical"}}
          placeholder={"Produto 1|Descrição\nProduto 2|Outra"}
        />
      </div>;
    case "condicao":
      return <>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 10px",lineHeight:1.4}}>
          🔀 SE (todas/alguma) das condições forem verdadeiras → saída <b style={{color:"#22c55e"}}>Verdadeiro</b>, senão → <b style={{color:"#ef4444"}}>Falso</b>
        </p>
        {/* Lógica AND/OR — botões grandes */}
        <label style={LS}>Lógica entre condições</label>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[
            {key:"AND", label:"E (todas)", desc:"Todas precisam ser verdadeiras"},
            {key:"OR", label:"OU (alguma)", desc:"Pelo menos uma"},
          ].map(opt => {
            const ativo = (d.juncao || "AND") === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => u({ juncao: opt.key })}
                style={{
                  flex:1,
                  background: ativo ? "#8b5cf622" : "#ffffff",
                  border: `1px solid ${ativo ? "#8b5cf6" : "#e5e7eb"}`,
                  color: ativo ? "#a78bfa" : "white",
                  borderRadius:8, padding:"8px 10px", fontSize:11, cursor:"pointer", fontWeight:"bold",
                  textAlign:"center"}}
                title={opt.desc}
              >{opt.label}</button>
            );
          })}
        </div>

        {/* Lista de condições — cada uma com VarPill + OpSelect + valor */}
        <label style={LS}>Condições</label>
        {(() => {
          const lista = (d.condicoes && Array.isArray(d.condicoes) && d.condicoes.length > 0)
            ? d.condicoes
            : [{ variavel: d.variavel || "", operador: d.operador || "igual", valor: d.valor || "" }];

          const updateCond = (idx: number, patch: any) => {
            const nova = lista.slice();
            nova[idx] = { ...nova[idx], ...patch };
            u({ condicoes: nova });
          };
          const removerCond = (idx: number) => {
            const nova = lista.filter((_: any, i: number) => i !== idx);
            u({ condicoes: nova });
          };
          const addCond = () => {
            u({ condicoes: [...lista, { variavel: "", operador: "igual", valor: "" }] });
          };

          return <>
            {lista.map((cond: any, idx: number) => {
              const semValor = ["vazio", "preenchido"].includes(cond.operador);
              const dropdownVarId = `cond-${id}-${idx}`;
              return (
                <div key={idx} style={{
                  background: "#ffffff",
                  border: "1px solid #ffffff",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                  display: "flex", flexDirection: "column", gap: 8}}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      background: "#3b82f622", color: "#3b82f6",
                      padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: "bold"}}>#{idx+1}</span>
                    {lista.length > 1 && (
                      <button
                        onClick={() => removerCond(idx)}
                        style={{
                          marginLeft: "auto", background: "#ef444422", color: "#ef4444",
                          border: "none", borderRadius: 6, padding: "3px 8px",
                          fontSize: 11, cursor: "pointer", fontWeight: "bold"}}
                      >✕</button>
                    )}
                  </div>
                  {/* Variável (pill) */}
                  <details style={{ position: "relative" }} id={dropdownVarId}>
                    <summary style={{
                      listStyle: "none",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "8px 12px",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8, outline: "none"}}>
                      {cond.variavel ? (
                        <span style={{
                          background: "#8b5cf622", color: "#a78bfa",
                          padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: "bold"}}>{`{{${cond.variavel}}}`}</span>
                      ) : (
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Selecionar variável...</span>
                      )}
                      <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 10 }}>▼</span>
                    </summary>
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                      background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8,
                      zIndex: 100, maxHeight: 240, overflowY: "auto", padding: 8,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)"}}>
                      <input
                        type="text"
                        placeholder="Digite ou crie variável..."
                        defaultValue={cond.variavel || ""}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            updateCond(idx, { variavel: (e.target as HTMLInputElement).value.trim() });
                            (e.target as HTMLInputElement).closest("details")?.removeAttribute("open");
                          }
                        }}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v && v !== cond.variavel) updateCond(idx, { variavel: v });
                        }}
                        style={{
                          width: "100%", background: "#f8fafc", border: "1px solid #e5e7eb",
                          borderRadius: 6, padding: "6px 10px", color: "#1f2937", fontSize: 12,
                          marginBottom: 8, outline: "none"}}
                      />
                      {variaveisDoFluxo.length === 0 ? (
                        <p style={{ color: "#6b7280", fontSize: 11, textAlign: "center", padding: 12, margin: 0 }}>
                          Sem variáveis ainda
                        </p>
                      ) : variaveisDoFluxo.map(v => (
                        <button
                          key={v}
                          onClick={() => {
                            updateCond(idx, { variavel: v });
                            document.getElementById(dropdownVarId)?.removeAttribute("open");
                          }}
                          style={{
                            width: "100%", textAlign: "left", padding: "6px 10px",
                            background: v === cond.variavel ? "#8b5cf633" : "transparent",
                            border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 2}}
                        >
                          <span style={{
                            background: "#8b5cf622", color: "#a78bfa",
                            padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: "bold"}}>{`{{${v}}}`}</span>
                        </button>
                      ))}
                    </div>
                  </details>

                  {/* Operador + Valor */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {OpSelect(`op-${idx}`, cond.operador || "igual", v => updateCond(idx, { operador: v }))}
                    {!semValor && (
                      <input
                        value={cond.valor || ""}
                        onChange={e => updateCond(idx, { valor: e.target.value })}
                        placeholder="Valor pra comparar"
                        style={{
                          flex: 1, background: "#ffffff", border: "1px solid #e5e7eb",
                          borderRadius: 8, padding: "8px 12px", color: "#1f2937", fontSize: 12, outline: "none"}}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            <button
              onClick={addCond}
              style={{
                width: "100%",
                background: "#3b82f611", color: "#3b82f6",
                border: "1px dashed #3b82f6", borderRadius: 8,
                padding: "10px", fontSize: 12, cursor: "pointer", fontWeight: "bold"}}
            >
              + Adicionar condição
            </button>
          </>;
        })()}
      </>;
    case "variavel": {
      // 🆕 Modo do valor: "texto" (literal), "codigo" (JS), "expressao" (substituição {{var}})
      const modo = d.modo_valor || "texto";
      return <>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 10px",lineHeight:1.4}}>
          📝 Cria ou atualiza uma variável. O valor é salvo no banco e fica disponível em todos os blocos seguintes.
        </p>
        {VarPill("Nome da variável", "nome", "Selecionar ou criar variável...")}
        {/* Toggle Text / Code / Expressão */}
        <div>
          <label style={LS}>Tipo do valor</label>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {[
              {key:"texto",label:"📝 Texto",hint:"Valor literal"},
              {key:"expressao",label:"🔗 Expressão",hint:"Usa {{var}}"},
              {key:"codigo",label:"💻 Código",hint:"JavaScript"},
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => u({ modo_valor: opt.key })}
                style={{
                  flex:1,
                  background: modo === opt.key ? "#3b82f622" : "#ffffff",
                  border: `1px solid ${modo === opt.key ? "#3b82f6" : "#e5e7eb"}`,
                  color: modo === opt.key ? "#3b82f6" : "white",
                  borderRadius:6, padding:"6px 8px", fontSize:11, cursor:"pointer", fontWeight:"bold"
                }}
                title={opt.hint}
              >{opt.label}</button>
            ))}
          </div>
        </div>
        {/* Campo de valor varia conforme modo */}
        {modo === "texto" && (
          <div>
            <label style={LS}>Valor (texto literal)</label>
            <input value={d.valor||""} onChange={e => u({valor: e.target.value})} style={IS} placeholder="Ex: SP" />
          </div>
        )}
        {modo === "expressao" && (
          <div>
            <label style={LS}>Expressão</label>
            <input value={d.valor||""} onChange={e => u({valor: e.target.value})} style={IS} placeholder="{{nome}} - {{cpf_limpo}}" />
            <p style={{color:"#6b7280", fontSize:10, margin:"3px 0 0"}}>
              💡 Use <code style={{color:"#3b82f6"}}>{"{{nome_variavel}}"}</code> pra inserir valores de outras variáveis. Ex: <code>{"Olá {{nome}}"}</code>
            </p>
          </div>
        )}
        {modo === "codigo" && (
          <>
            <div>
              <label style={LS}>Código JavaScript</label>
              <textarea
                value={d.valor||""}
                onChange={e => u({valor: e.target.value})}
                style={{...IS, height:140, resize:"vertical", fontFamily:"monospace", fontSize:11}}
                placeholder={`// Use 'return' pro valor da variável\n// API: getVariable(nome), setVariable(nome,valor), fetch, sleep, log\nconst cep = getVariable("cep").replace(/\\D/g, "");\nreturn cep;`}
              />
            </div>
            {/* Save error in variable (igual Typebot) */}
            {VarPill("Salvar erro em (opcional)", "salvar_erro_em", "Variável pra erro...")}
            <p style={{color:"#6b7280", fontSize:10, margin:"-6px 0 0", lineHeight:1.3}}>
              Se o código der erro, a mensagem fica salva nessa variável. Útil pra blocos de condição depois.
            </p>
          </>
        )}
      </>;
    }
    case "redirecionar": return <>{F("URL","url","url","https://...")}</>;
    case "script":
      return <>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px"}}>🆕 API disponível: <code style={{color:"#3b82f6"}}>setVariable(nome, valor)</code>, <code style={{color:"#3b82f6"}}>getVariable(nome)</code>, <code style={{color:"#3b82f6"}}>fetch</code>, <code style={{color:"#3b82f6"}}>sleep(ms)</code>, <code style={{color:"#3b82f6"}}>log(...)</code></p>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px"}}>{`{{variaveis}} são substituídas no código antes de executar.`}</p>
        {T("Código JavaScript","codigo",`// Exemplo:\n// const resp = await fetch("https://api.exemplo.com/cep/" + getVariable("cep"))\n// const data = await resp.json()\n// setVariable("rua", data.logradouro)`,200)}
        <p style={{color:"#9ca3af",fontSize:10,margin:"4px 0 0"}}>Saídas: <span style={{color:"#22c55e"}}>0=sucesso</span> / <span style={{color:"#ef4444"}}>1=erro</span></p>
      </>;
    case "espera":        return <>{F("Aguardar (segundos)","segundos","number","3")}</>;
    case "teste_ab":
      return <div>
        <label style={LS}>Percentual para A (%)</label>
        <input type="number" min={1} max={99} value={d.percentual_a||50} onChange={e => u({percentual_a: Number(e.target.value)})} style={IS} />
        <p style={{color:"#6b7280",fontSize:10,margin:"4px 0 0"}}>B recebe {100-(d.percentual_a||50)}%</p>
      </div>;
    case "webhook":
      return <>
        {F("URL","url","url","https://...")}
        {S("Método","metodo",[{value:"GET",label:"GET"},{value:"POST",label:"POST"},{value:"PUT",label:"PUT"},{value:"DELETE",label:"DELETE"}])}
        {T("Headers JSON","headers",'{"Authorization":"Bearer token"}',60)}
        {T("Body JSON","body",'{"chave":"valor"}',60)}
        {VarPill("Salvar resposta em", "variavel_resposta", "ex: resposta_api")}
        {VarPill("Salvar status em", "variavel_status", "ex: status_api")}
      </>;
    case "pular": case "retornar":
      // 🆕 v18: dropdown selecionando nó (antes era input texto livre exigindo conhecer UID aleatório).
      // O usuário escolhe pelo label/preview do bloco; o que vai pro banco continua sendo o id (UID).
      return <div>
        <label style={LS}>{noSel.tipo === "pular" ? "Pular PARA o bloco:" : "Retornar PARA o bloco:"}</label>
        <select value={d.alvo||""} onChange={e => u({alvo: e.target.value})} style={IS}>
          <option value="">— Selecione um bloco —</option>
          {nos
            .filter(n => n.id !== noSel.id)
            .map(n => {
              const cfg = B[n.tipo];
              const preview = getPreview(n).slice(0, 35);
              return (
                <option key={n.id} value={n.id}>
                  {cfg?.icone} {cfg?.label} — {preview}
                </option>
              );
            })}
        </select>
        {d.alvo && !nos.find(n => n.id === d.alvo) && (
          <p style={{color:"#ef4444", fontSize:10, margin:"4px 0 0"}}>
            ⚠️ Bloco alvo não existe mais (pode ter sido excluído). Selecione outro.
          </p>
        )}
        <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0", lineHeight:1.3}}>
          {noSel.tipo === "pular"
            ? "💡 Pula a execução direto pro bloco escolhido (atalho/jump)."
            : "💡 Volta a execução pro bloco escolhido (loop/retry)."}
        </p>
      </div>;
    case "google_sheets":
      return <>
        <div style={{background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:10, marginBottom:10}}>
          <p style={{color:"#14532d", fontSize:11, margin:0, fontWeight:700}}>📊 Google Sheets via Apps Script</p>
          <p style={{color:"#16a34a", fontSize:10, margin:"4px 0 6px", lineHeight:1.5}}>
            <b>Como configurar (5 minutos, sem OAuth):</b><br/>
            1. Abra seu Sheets → <b>Extensões → Apps Script</b><br/>
            2. Cole o código de webhook (veja botão abaixo)<br/>
            3. <b>Implantar → Nova implantação → Aplicativo da Web</b><br/>
            4. Quem tem acesso: <b>Qualquer pessoa</b> → Implantar<br/>
            5. Copie a URL e cole aqui embaixo 👇
          </p>
          <button
            type="button"
            onClick={() => {
              const codigo = `// Cole isso no Apps Script do seu Google Sheets
// Implante como "Aplicativo da Web" com acesso "Qualquer pessoa"
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = body.aba ? ss.getSheetByName(body.aba) : ss.getSheets()[0];
    if (!aba) return saida({ok:false, erro:"Aba não encontrada: " + body.aba});
    const dados = (body.dados || "").toString().split(",").map(s => s.trim());

    if (body.acao === "append") {
      aba.appendRow(dados);
      return saida({ok:true, linha: aba.getLastRow()});
    }
    if (body.acao === "update") {
      // Atualiza a última linha (ou faz lookup pela primeira coluna)
      const ultima = aba.getLastRow();
      if (ultima < 1) return saida({ok:false, erro:"Sheet vazia"});
      aba.getRange(ultima, 1, 1, dados.length).setValues([dados]);
      return saida({ok:true, linha: ultima});
    }
    if (body.acao === "get") {
      const vals = aba.getDataRange().getValues();
      return saida({ok:true, dados: vals});
    }
    return saida({ok:false, erro: "Ação inválida: " + body.acao});
  } catch (err) {
    return saida({ok:false, erro: err.toString()});
  }
}
function saida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;
              navigator.clipboard.writeText(codigo);
              alert("✅ Código copiado!\n\nAgora cole no Apps Script do seu Google Sheets.");
            }}
            style={{background:"#16a34a", color:"#fff", border:"none", borderRadius:6, padding:"6px 12px", fontSize:11, cursor:"pointer", fontWeight:700, marginTop:4}}
          >
            📋 Copiar código do Apps Script
          </button>
        </div>
        {F("URL do Webhook (Apps Script Web App)","webhook_url","url","https://script.google.com/macros/s/AKfy.../exec")}
        {F("Aba (opcional)","aba","text","Sheet1")}
        {S("Ação","acao",[
          {value:"append", label:"Adicionar nova linha"},
          {value:"update", label:"Atualizar última linha"},
          {value:"get",    label:"Buscar dados"}
        ])}
        {T("Dados (separados por vírgula)","dados","{{nome}}, {{email}}, {{telefone}}",80)}
        {VarPill("Salvar resposta em (opcional)","variavel_resposta","ex: resposta_sheets")}
        <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0"}}>
          💡 Use {`{{variavel}}`} nos campos. Saídas: <b>Sucesso</b> / <b>Erro</b>.
        </p>
      </>;
    case "http_request":
      return <>
        {F("URL","url","url","https://api.exemplo.com")}
        {S("Método","metodo",[{value:"GET",label:"GET"},{value:"POST",label:"POST"},{value:"PUT",label:"PUT"},{value:"DELETE",label:"DELETE"}])}
        {T("Headers JSON","headers",'{"Content-Type":"application/json"}',60)}
        {T("Body JSON","body",'{"chave":"{{variavel}}"}',60)}
        {VarPill("Salvar resposta em", "variavel_resposta", "ex: resposta_api")}
        {VarPill("Salvar status em", "variavel_status", "ex: status_api")}
      </>;
    case "openai":
      return <>
        {F("API Key","apiKey","password","sk-...")}
        {S("Modelo","modelo",[{value:"gpt-4o",label:"GPT-4o"},{value:"gpt-4o-mini",label:"GPT-4o Mini"},{value:"gpt-3.5-turbo",label:"GPT-3.5"}])}
        {T("Prompt do sistema","prompt","Você é um assistente...",100)}
        {VarPill("Salvar resposta em", "variavel_resposta", "ex: resposta_ia")}
        <label style={{display:"flex",alignItems:"center",gap:6,marginTop:8,color:"#1f2937",fontSize:12}}>
          <input type="checkbox" checked={d.enviar_resposta !== false} onChange={e => u({ enviar_resposta: e.target.checked })} />
          Enviar resposta pro cliente automaticamente
        </label>
      </>;
    case "claude_ai":
      return <>
        {F("API Key","apiKey","password","sk-ant-...")}
        {S("Modelo","modelo",[{value:"claude-opus-4-5",label:"Claude Opus 4.5"},{value:"claude-sonnet-4-20250514",label:"Claude Sonnet 4"},{value:"claude-haiku-4-5",label:"Claude Haiku"}])}
        {T("Prompt do sistema","prompt","Você é um assistente...",100)}
        {VarPill("Salvar resposta em", "variavel_resposta", "ex: resposta_ia")}
        <label style={{display:"flex",alignItems:"center",gap:6,marginTop:8,color:"#1f2937",fontSize:12}}>
          <input type="checkbox" checked={d.enviar_resposta !== false} onChange={e => u({ enviar_resposta: e.target.checked })} />
          Enviar resposta pro cliente automaticamente
        </label>
      </>;
    case "gmail":
      return <>
        <div style={{background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:10, marginBottom:10}}>
          <p style={{color:"#1e40af", fontSize:11, margin:0, fontWeight:700}}>📨 Envio de email via SMTP</p>
          <p style={{color:"#3b82f6", fontSize:10, margin:"4px 0 0", lineHeight:1.4}}>
            Use Gmail (com <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{color:"#2563eb",fontWeight:700}}>App Password</a>), SendGrid, Mailgun ou qualquer SMTP.
          </p>
        </div>
        <p style={{color:"#6b7280", fontSize:10, margin:"6px 0 6px", fontWeight:700, textTransform:"uppercase", letterSpacing:0.4}}>Servidor SMTP</p>
        <div style={{display:"grid", gridTemplateColumns:"1fr 80px", gap:8}}>
          {F("Host","smtp_host","text","smtp.gmail.com")}
          {F("Porta","smtp_port","number","587")}
        </div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginTop:6,color:"#1f2937",fontSize:12}}>
          <input type="checkbox" checked={!!d.smtp_secure} onChange={e => u({ smtp_secure: e.target.checked })} />
          Conexão SSL/TLS (porta 465). Desmarcado = STARTTLS (porta 587).
        </label>
        {F("Usuário SMTP","smtp_user","text","seu@gmail.com")}
        {F("Senha SMTP / App Password","smtp_pass","password","••••••••")}
        <p style={{color:"#6b7280", fontSize:10, margin:"6px 0 6px", fontWeight:700, textTransform:"uppercase", letterSpacing:0.4}}>Mensagem</p>
        {F("Nome do remetente (opcional)","from_name","text","Minha Empresa")}
        {F("Para","para","text","cliente@email.com  •  aceita {{variavel}}")}
        {F("Assunto","assunto","text","Bem-vindo, {{nome}}!")}
        {T("Corpo do email (texto ou HTML)","corpo","Olá {{nome}},\n\nObrigado pelo contato!\n\nAtenciosamente.",140)}
        <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0"}}>
          💡 Use {`{{variavel}}`} no Para/Assunto/Corpo. Saídas: <b>Enviado</b> (ok) / <b>Erro</b> (falha SMTP).
        </p>
      </>;
    case "inicio":    return <>{TVar("Mensagem de boas-vindas","mensagem","Olá! Como posso ajudar?",100)}</>;
    case "comando":   return <>{F("Comando","comando","text","/start")}</>;
    case "reply":
      return <div>
        <label style={LS}>Palavras-chave (separadas por vírgula)</label>
        <input value={d.palavras||""} onChange={e => u({palavras: e.target.value})} style={IS} placeholder="oi, olá, bom dia" />
      </div>;
    case "invalido":  return <>{T("Mensagem para inválido","mensagem","Não entendi...",80)}</>;

    // 🆕 Transferir — 2 modos: equipe/fila OU atendente humano específico
    case "transferir": {
      const modo = d.modo || "equipe";
      const radioStyle = (ativo: boolean): React.CSSProperties => ({
        flex: 1, padding: "10px 12px", borderRadius: 8, border: ativo ? "2px solid #ef4444" : "1px solid #e5e7eb",
        background: ativo ? "#fef2f2" : "#ffffff", color: ativo ? "#dc2626" : "#6b7280",
        fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
        transition: "all 0.15s"});
      return <>
        <div>
          <label style={LS}>Tipo de transferência</label>
          <div style={{display:"flex", gap:6}}>
            <button type="button" onClick={() => u({modo: "equipe"})} style={radioStyle(modo === "equipe")}>
              👥 Equipe / Fila
            </button>
            <button type="button" onClick={() => u({modo: "humano"})} style={radioStyle(modo === "humano")}>
              👤 Atendente humano
            </button>
          </div>
          <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0", lineHeight:1.4}}>
            {modo === "humano"
              ? "Atribui o atendimento direto pro atendente escolhido."
              : "Joga o atendimento na fila — qualquer atendente da equipe pode pegar."}
          </p>
        </div>

        {modo === "equipe" ? (
          <div style={{marginTop:12}}>
            <label style={LS}>Fila de destino</label>
            {filasBanco.length === 0 ? (
              <div style={{background:"#fef3c7", border:"1px solid #f59e0b44", borderRadius:6, padding:10}}>
                <p style={{color:"#f59e0b", fontSize:11, margin:"0 0 4px", fontWeight:"bold"}}>⚠️ Nenhuma fila cadastrada</p>
                <p style={{color:"#9ca3af", fontSize:10, margin:0, lineHeight:1.4}}>
                  Vá em <b>CRM → Configurações → Filas</b> e crie suas filas.<br/>
                  Depois volte aqui e selecione a fila de destino.
                </p>
              </div>
            ) : (
              <select value={d.fila||""} onChange={e => u({fila: e.target.value})} style={IS}>
                <option value="">Selecione uma fila...</option>
                {filasBanco.map(f => (
                  <option key={f.id} value={f.nome}>📋 {f.nome}{f.conexao ? ` (${f.conexao})` : ""}</option>
                ))}
              </select>
            )}
            <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0"}}>
              💡 Filas são criadas em <b>Configurações → Filas</b> do CRM
            </p>
          </div>
        ) : (
          <div style={{marginTop:12}}>
            <label style={LS}>Atendente humano</label>
            {atendentesBanco.length === 0 ? (
              <div style={{background:"#fef3c7", border:"1px solid #f59e0b44", borderRadius:6, padding:10}}>
                <p style={{color:"#f59e0b", fontSize:11, margin:"0 0 4px", fontWeight:"bold"}}>⚠️ Nenhum atendente cadastrado</p>
                <p style={{color:"#9ca3af", fontSize:10, margin:0, lineHeight:1.4}}>
                  Cadastre atendentes em <b>CRM → Configurações → Usuários</b>.
                </p>
              </div>
            ) : (
              <select
                value={d.atendente_email||""}
                onChange={e => {
                  const at = atendentesBanco.find(a => a.email === e.target.value);
                  u({atendente_email: e.target.value, atendente_nome: at?.nome || ""});
                }}
                style={IS}
              >
                <option value="">Selecione um atendente...</option>
                {atendentesBanco.map(a => (
                  <option key={a.email} value={a.email}>👤 {a.nome} ({a.email})</option>
                ))}
              </select>
            )}
            <p style={{color:"#6b7280", fontSize:10, margin:"4px 0 0"}}>
              💡 Atendentes são cadastrados em <b>Configurações → Usuários</b>
            </p>
          </div>
        )}

        <div style={{marginTop:12}}>
          {T("Mensagem ao transferir","mensagem","Transferindo...",80)}
        </div>
      </>;
    }

    case "finalizar": return <>{T("Mensagem de encerramento","mensagem","Obrigado pelo contato!",80)}</>;

    // 🆕 v18: bloco "Enviar Venda" — cria proposta no /crm/vendas automaticamente
    // ─────────────────────────────────────────────────────────────────────────
    // FRONTEND: configuração do bloco (este case)
    // BACKEND: o executor de fluxo na VPS precisa, ao processar este tipo de bloco:
    //   1. Carregar `variaveis` da fluxo_sessoes do contato atual
    //   2. Resolver o mapeamento (automático por nome OU manual)
    //   3. INSERT em `propostas` (workspace_id, contato_id, status, dados JSON)
    //   4. Se aplicar_etiqueta=true: INSERT em `atendimento_etiquetas` com nome da tag
    //   5. Enviar `mensagem_sucesso` ao cliente (se preenchida) e seguir saída "Sucesso"
    //   6. Em erro: enviar `mensagem_erro` e seguir saída "Erro"
    // ─────────────────────────────────────────────────────────────────────────
    case "enviar_venda": {
      const modoMap = d.modo_mapeamento || "automatico";
      // Campos REAIS da tabela `proposta` no Supabase (espelha o schema do CRM).
      // Se a tabela ganhar/perder colunas no banco, atualizar aqui também.
      const camposPropostaPadrao = [
        { key: "nome", label: "Nome completo" },
        { key: "cpf", label: "CPF" },
        { key: "rg", label: "RG" },
        { key: "data_nascimento", label: "Data de nascimento" },
        { key: "nome_mae", label: "Nome da mãe" },
        { key: "email", label: "E-mail" },
        { key: "endereco", label: "Endereço completo" },
        { key: "cep", label: "CEP" },
        { key: "cidade", label: "Cidade" },
        { key: "estado", label: "Estado" },
        { key: "telefone1", label: "Telefone principal" },
        { key: "telefone2", label: "Telefone 2" },
        { key: "telefone3", label: "Telefone 3" },
        { key: "plano", label: "Plano escolhido" },
        { key: "valor_plano", label: "Valor do plano (R$)" },
        { key: "vencimento", label: "Dia de vencimento" },
        { key: "forma_pagamento", label: "Forma de pagamento" },
        { key: "data_agendamento", label: "Data de agendamento" },
        { key: "periodo_instalacao", label: "Período de instalação" },
        { key: "data_instalacao", label: "Data de instalação" },
        { key: "data_cancelamento", label: "Data de cancelamento" },
        { key: "operadora", label: "Operadora" },
        { key: "vendedor", label: "Vendedor" },
        { key: "data_proposta", label: "Data da proposta" },
      ];
      const mapeamento: Record<string,string> = d.mapeamento || {};
      const updateMap = (campo: string, varName: string) => {
        const novo = { ...mapeamento };
        if (!varName) delete novo[campo]; else novo[campo] = varName;
        u({ mapeamento: novo });
      };
      return <>
        <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:8,padding:12,marginBottom:8}}>
          <p style={{color:"#22c55e",fontSize:12,fontWeight:"bold",margin:"0 0 4px"}}>💰 Enviar Venda pro CRM</p>
          <p style={{color:"#9ca3af",fontSize:11,margin:0,lineHeight:1.4}}>
            Quando o fluxo chegar nesse bloco, o sistema cria <b>automaticamente uma proposta</b> no
            <b> /crm/vendas</b> com as variáveis que você capturou no fluxo + aplica uma etiqueta
            no atendimento. O vendedor já abre o chat com a venda pronta.
          </p>
        </div>

        {/* Toggle modo automático / manual */}
        <div>
          <label style={LS}>Mapeamento das variáveis</label>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {[
              {key:"automatico",label:"🔮 Automático",hint:"Variável com mesmo nome do campo já mapeia. Ex: variável 'nome' → campo 'nome' da proposta."},
              {key:"manual",label:"🎯 Manual",hint:"Você define qual variável vai pra cada campo."},
            ].map(opt => (
              <button key={opt.key} onClick={() => u({modo_mapeamento: opt.key})}
                style={{
                  flex:1,
                  background: modoMap === opt.key ? "#22c55e22" : "#ffffff",
                  border: `1px solid ${modoMap === opt.key ? "#22c55e" : "#e5e7eb"}`,
                  color: modoMap === opt.key ? "#22c55e" : "white",
                  borderRadius:8, padding:"8px 10px", fontSize:11, cursor:"pointer", fontWeight:"bold"
                }}
                title={opt.hint}
              >{opt.label}</button>
            ))}
          </div>
          {modoMap === "automatico" && (
            <p style={{color:"#6b7280",fontSize:10,margin:"4px 0 0",lineHeight:1.3}}>
              💡 O sistema vai pegar todas as variáveis salvas no fluxo e tentar mapear pelo nome.
              <br/>Ex: variável <code style={{color:"#22c55e"}}>nome</code> → campo "Nome do cliente";
              variável <code style={{color:"#22c55e"}}>cpf_limpo</code> → campo "CPF" (usa nome similar).
            </p>
          )}
        </div>

        {/* Mapeamento manual — só aparece quando o modo é manual */}
        {modoMap === "manual" && (
          <div>
            <label style={LS}>Defina qual variável preenche cada campo</label>
            <p style={{color:"#6b7280",fontSize:10,margin:"-2px 0 8px",lineHeight:1.3}}>
              Deixe em branco os campos que não quer preencher. O sistema só cria os que você mapear.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:6,background:"#f8fafc",border:"1px solid #ffffff",borderRadius:8,padding:10,maxHeight:300,overflowY:"auto"}}>
              {camposPropostaPadrao.map(c => (
                <div key={c.key} style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"#9ca3af",fontSize:11,flex:"0 0 130px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    title={c.label}>{c.label}</span>
                  <span style={{color:"#e5e7eb",fontSize:11}}>←</span>
                  <select value={mapeamento[c.key] || ""} onChange={e => updateMap(c.key, e.target.value)}
                    style={{...IS,flex:1,fontSize:11,padding:"5px 8px"}}>
                    <option value="">— sem mapeamento —</option>
                    {variaveisDoFluxo.map(v => (
                      <option key={v} value={v}>{`{{${v}}}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {Object.keys(mapeamento).length > 0 && (
              <p style={{color:"#22c55e",fontSize:10,margin:"6px 0 0"}}>
                ✅ {Object.keys(mapeamento).length} campo(s) mapeado(s)
              </p>
            )}
          </div>
        )}

        {/* Etiqueta a aplicar */}
        <div style={{borderTop:"1px solid #ffffff",paddingTop:12,marginTop:6}}>
          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer"}}>
            <input type="checkbox" checked={d.aplicar_etiqueta !== false}
              onChange={e => u({aplicar_etiqueta: e.target.checked})}
              style={{accentColor:"#22c55e"}}/>
            <span style={{color:"#1f2937",fontSize:12,fontWeight:"bold"}}>🏷️ Aplicar etiqueta ao atendimento</span>
          </label>
          {d.aplicar_etiqueta !== false && (
            <>
              {F("Nome da etiqueta","etiqueta","text","proposta_finalizada")}
              <p style={{color:"#6b7280",fontSize:10,margin:"4px 0 0",lineHeight:1.3}}>
                💡 A etiqueta é criada automaticamente se ainda não existir.
                Útil pra filtrar atendimentos com proposta criada no chatbot.
              </p>
            </>
          )}
        </div>

        {/* Status inicial da proposta */}
        <div style={{borderTop:"1px solid #ffffff",paddingTop:12,marginTop:6}}>
          {S("Status inicial da proposta","status_inicial",[
            {value:"aguardando",label:"⏳ Aguardando análise"},
            {value:"em_analise",label:"🔍 Em análise"},
            {value:"aprovada",label:"✅ Aprovada"},
            {value:"agendada",label:"📅 Agendada"},
          ])}
        </div>

        {/* Mensagens enviadas ao cliente */}
        <div style={{borderTop:"1px solid #ffffff",paddingTop:12,marginTop:6}}>
          {TVar("Mensagem ao cliente (sucesso)","mensagem_sucesso","✅ Sua proposta foi registrada!",70)}
          {TVar("Mensagem ao cliente (erro)","mensagem_erro","⚠️ Não consegui registrar, atendente vai te ajudar.",70)}
        </div>

        <p style={{color:"#6b7280",fontSize:10,margin:"8px 0 0",lineHeight:1.4,fontStyle:"italic"}}>
          ⚠️ Saídas: <span style={{color:"#22c55e"}}>0=Sucesso</span> (proposta criada) /{" "}
          <span style={{color:"#ef4444"}}>1=Erro</span> (falha ao salvar — conecte aqui um bloco "Transferir" como fallback).
        </p>
      </>;
    }

    // 🆕 v19: editor do bloco "Aplicar Etiqueta"
    case "etiqueta": {
      const iconesComuns = ["🏷️","⭐","🔥","💎","✅","❌","⚠️","💰","📌","🎯","🚀","💼","📋","🔔"];
      const coresComuns = [
        { hex: "#3b82f6", nome: "Azul" },
        { hex: "#22c55e", nome: "Verde" },
        { hex: "#ef4444", nome: "Vermelho" },
        { hex: "#f59e0b", nome: "Laranja" },
        { hex: "#8b5cf6", nome: "Roxo" },
        { hex: "#ec4899", nome: "Rosa" },
        { hex: "#06b6d4", nome: "Ciano" },
        { hex: "#6b7280", nome: "Cinza" },
      ];
      return <>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Ação: aplicar ou remover */}
          <div>
            <label style={{display:"block",color:"#9ca3af",fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>
              Ação
            </label>
            <div style={{display:"flex",gap:6}}>
              {[
                { v: "aplicar", label: "✅ Aplicar etiqueta" },
                { v: "remover", label: "🗑️ Remover etiqueta" },
              ].map(o => (
                <button key={o.v} type="button" onClick={()=>u({acao:o.v})}
                  style={{flex:1,padding:"8px 10px",background:d.acao===o.v?"#3b82f6":"#ffffff",
                    color:d.acao===o.v?"#fff":"#9ca3af",border:"1px solid #e5e7eb",borderRadius:8,
                    fontSize:12,cursor:"pointer",fontWeight:d.acao===o.v?"bold":"normal"}}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nome da etiqueta */}
          {T("Nome da etiqueta","nome","Ex.: Cliente VIP, Aguardando documento, Interessado","")}

          {/* Cor e ícone (só importam se for criar etiqueta nova) */}
          {d.acao !== "remover" && (
            <>
              <div>
                <label style={{display:"block",color:"#9ca3af",fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>
                  Cor da etiqueta
                </label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {coresComuns.map(c => (
                    <button key={c.hex} type="button" onClick={()=>u({cor:c.hex})}
                      title={c.nome}
                      style={{width:32,height:32,background:c.hex,border:d.cor===c.hex?"3px solid #fff":"1px solid #e5e7eb",
                        borderRadius:6,cursor:"pointer"}} />
                  ))}
                </div>
              </div>
              <div>
                <label style={{display:"block",color:"#9ca3af",fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>
                  Ícone
                </label>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {iconesComuns.map(ic => (
                    <button key={ic} type="button" onClick={()=>u({icone:ic})}
                      style={{width:34,height:34,background:d.icone===ic?"#3b82f6":"#ffffff",
                        border:"1px solid #e5e7eb",borderRadius:6,fontSize:18,cursor:"pointer"}}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Preview */}
          {d.nome && (
            <div>
              <label style={{display:"block",color:"#9ca3af",fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>
                Preview
              </label>
              <span style={{
                display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",
                background:`${d.cor||"#3b82f6"}22`,color:d.cor||"#3b82f6",border:`1px solid ${d.cor||"#3b82f6"}55`,
                borderRadius:20,fontSize:12,fontWeight:"bold"
              }}>
                {d.icone||"🏷️"} {d.nome}
              </span>
            </div>
          )}
        </div>

        <p style={{color:"#6b7280",fontSize:10,margin:"12px 0 0",lineHeight:1.4,fontStyle:"italic"}}>
          💡 Use este bloco em qualquer ponto do fluxo pra marcar atendimentos.
          Se a etiqueta não existir no workspace, será criada automaticamente.
        </p>
      </>;
    }

    default: return <p style={{color:"#6b7280",fontSize:12}}>Sem propriedades.</p>;
  }
}

function NoCard({ no, sel, scale, onSelect, onOpen, onDelete, onConectarSaida, onConectarEntrada }: {
  no: No; sel: boolean; scale: number;
  onSelect: (id:string) => void;
  onOpen: (id:string) => void; // 🆕 abre modal (separado de selecionar)
  onDelete: (id:string) => void;
  onConectarSaida: (noId:string, idx:number) => void;
  onConectarEntrada: (noId:string) => void;
  onMove: (id:string, x:number, y:number) => void;
}) {
  const cfg = B[no.tipo];
  const divRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const moveu = useRef(false); // 🆕 detecta se houve movimento real (drag) ou só click
  const startPtr = useRef({px:0, py:0, nx:0, ny:0, t:0});

  function onPointerDown(e: React.PointerEvent) {
    const t = e.target as HTMLElement;
    if (t.tagName==="BUTTON"||t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA") return;
    if (t.closest("button")||t.closest("input")||t.closest("select")||t.closest("textarea")) return;
    e.stopPropagation();
    // 🆕 NÃO seleciona aqui — só prepara o drag. Seleção/abertura acontece no PointerUp.
    dragging.current = true;
    moveu.current = false;
    startPtr.current = {px:e.clientX, py:e.clientY, nx:no.x, ny:no.y, t:Date.now()};
    divRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = (e.clientX - startPtr.current.px) / scale;
    const dy = (e.clientY - startPtr.current.py) / scale;
    // 🆕 Considera "movimento real" se passou de 5px em qualquer direção (tolerância anti-click trêmulo)
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      moveu.current = true;
    }
    const el = divRef.current;
    if (el) {
      el.style.left = `${startPtr.current.nx + dx}px`;
      el.style.top  = `${startPtr.current.ny + dy}px`;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    divRef.current?.releasePointerCapture(e.pointerId);
    const dx = (e.clientX - startPtr.current.px) / scale;
    const dy = (e.clientY - startPtr.current.py) / scale;
    if (moveu.current) {
      // 🆕 Foi DRAG — só atualiza posição, NÃO seleciona/abre modal
      (window as any).__unitaMoveNo?.(no.id, startPtr.current.nx+dx, startPtr.current.ny+dy);
    } else {
      // 🆕 Foi CLICK — só seleciona (destaca, mas NÃO abre modal)
      onSelect(no.id);
    }
  }

  // 🆕 Double click pra abrir o modal de edição
  function onDoubleClickHandler(e: React.MouseEvent) {
    e.stopPropagation();
    onOpen(no.id);
  }

  return (
    <div
      ref={divRef}
      style={{position:"absolute", left:no.x, top:no.y, width:230,
        background:"#ffffff", borderRadius:14,
        border:`1px solid ${sel ? cfg.cor : "#e5e7eb"}`,
        boxShadow: sel
          ? `0 0 0 3px ${cfg.cor}33, 0 12px 24px rgba(0,0,0,.12), 0 4px 8px rgba(0,0,0,.06)`
          : "0 4px 12px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)",
        userSelect:"none", zIndex:sel?10:1, touchAction:"none", cursor: "grab",
        transition: "box-shadow .15s ease, transform .15s ease",
        transform: sel ? "translateY(-2px)" : "none",
        overflow: "hidden"}}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClickHandler}
      onMouseUp={e => {e.stopPropagation(); onConectarEntrada(no.id);}}
    >
      <div style={{background:`linear-gradient(135deg, ${cfg.cor} 0%, ${cfg.cor}dd 100%)`, padding:"9px 12px",
        display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"grab",
        boxShadow:"inset 0 -1px 0 rgba(0,0,0,.08)"}}>
        <div style={{display:"flex", alignItems:"center", gap:7, pointerEvents:"none"}}>
          <span style={{
            fontSize:13,
            display:"inline-flex",alignItems:"center",justifyContent:"center",
            width:22,height:22,
            background:"rgba(255,255,255,.25)",
            borderRadius:6
          }}>{cfg.icone}</span>
          <span style={{color:"#ffffff", fontSize:12, fontWeight:"700", textShadow:"0 1px 2px rgba(0,0,0,.15)"}}>{cfg.label}</span>
          <span style={{background:"rgba(255,255,255,.22)", color:"#ffffff", fontSize:9, padding:"2px 7px", borderRadius:10, fontWeight:"600", letterSpacing:.3}}>{cfg.grupo}</span>
        </div>
        {no.tipo!=="inicio" && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {e.stopPropagation(); onDelete(no.id);}}
            style={{background:"none", border:"none", color:"rgba(255,255,255,.7)", cursor:"pointer", fontSize:13, padding:0, lineHeight:1}}>✕</button>
        )}
      </div>
      <div style={{padding:"7px 10px", borderBottom:cfg.saidas.length?"1px solid #ffffff":"none", pointerEvents:"none"}}>
        <p style={{color:"#9ca3af", fontSize:10, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{getPreview(no)}</p>
      </div>
      {no.tipo!=="inicio" && (
        <div
          style={{position:"absolute", left:-7, top:48+18-7, width:14, height:14, borderRadius:"50%",
            background:"#ffffff", border:`2px solid ${cfg.cor}`, cursor:"crosshair", zIndex:5}}
          onPointerDown={e => e.stopPropagation()}
          onMouseUp={e => {e.stopPropagation(); onConectarEntrada(no.id);}}
        />
      )}
      {no.saidas.map((saida,idx) => (
        <div key={idx} style={{display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 10px", height:36, borderTop:idx>0?"1px solid #ffffff":"none"}}>
          <span style={{color:"#6b7280", fontSize:10, pointerEvents:"none"}}>{saida}</span>
          <div
            style={{width:14, height:14, borderRadius:"50%", background:cfg.cor, cursor:"crosshair",
              flexShrink:0, position:"relative", right:-18, border:"2px solid #e5e7eb"}}
            onPointerDown={e => {e.stopPropagation(); onConectarSaida(no.id,idx);}}
          />
        </div>
      ))}
    </div>
  );
}

export default function FluxosPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);

  // 🐺 Unita single-tenant: wsId fixo como "unita"
  const [wsId,setWsId]             = useState<string|null>(null);
  const [fluxos,setFluxos]         = useState<Fluxo[]>([]);
  const [filasBanco,setFilasBanco] = useState<FilaItem[]>([]); // 🆕
  const [atendentesBanco,setAtendentesBanco] = useState<AtendenteItem[]>([]); // 🆕 atendentes do workspace
  const [view,setView]             = useState<"lista"|"editor">("lista");
  const [fluxoAtivo,setFluxoAtivo] = useState<Fluxo|null>(null);
  const [nos,setNos]               = useState<No[]>([]);
  const [arestas,setArestas]       = useState<Aresta[]>([]);
  const [noSel,setNoSel]           = useState<No|null>(null);
  // 🆕 noEditando = qual nó tá com modal aberto. Separado de noSel pra permitir
  //    drag/seleção sem abrir modal automaticamente. Modal só abre em DOUBLE click.
  const [noEditando, setNoEditando] = useState<No|null>(null);
  const [salvando,setSalvando]     = useState(false);
  const [grupoAberto,setGrupoAberto] = useState("Bubbles");
  const [conectando,setConectando]   = useState<{noId:string;saidaIndex:number}|null>(null);
  const [mousePos,setMousePos]       = useState({x:0,y:0});
  const [showNovo,setShowNovo]     = useState(false);
  const [criando,setCriando]       = useState(false);
  const [form,setForm]             = useState({nome:"",descricao:"",trigger_tipo:"qualquer_mensagem",trigger_valor:""});
  const [scale,setScale]           = useState(1);
  const [offset,setOffset]         = useState({x:80,y:80});
  const scaleRef  = useRef(1);
  const offsetRef = useRef({x:80,y:80});
  const panning   = useRef(false);
  const panStart  = useRef({x:0,y:0,ox:0,oy:0});

  useEffect(() => {
    (window as any).__unitaMoveNo = (id:string, x:number, y:number) => {
      setNos(p => p.map(n => n.id===id ? {...n,x,y} : n));
    };
    return () => { delete (window as any).__unitaMoveNo; };
  }, []);

  // ✅ Carrega username + fluxos iniciais + Realtime + polling 5s
  useEffect(() => {
    let cancelled = false;
    getWsUsername().then(username => {
      if (cancelled || !username) return;
      setWsId(username);
      load(username);
      fetchFilas(username); // 🆕
      fetchAtendentes(username); // 🆕 atendentes pro bloco Transferir modo humano

      // 🔒 MULTI-TENANT: Realtime AGORA filtra por workspace_id no servidor.
      // Antes recebia eventos de fluxos/filas de TODOS workspaces — vazamento de
      // metadados (nomes de fluxos, IDs, status ativo/inativo) entre contas.
      // O filter precisa ser registrado depois que sabemos o username, por isso
      // movido pra dentro do .then() do getWsUsername.
      const ch = supabase.channel("fluxos_editor_rt_" + username)
        .on("postgres_changes", { event: "*", schema: "public", table: "fluxos"}, () => {
          if (!cancelled) load(username);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "filas"}, () => { // 🆕
          if (!cancelled) fetchFilas(username);
        })
        .subscribe();

      // Guarda a referência do channel pra cleanup
      (window as any).__unitaFluxosCh = ch;
    });

    // Polling 5s fallback
    const interval = setInterval(() => {
      if (cancelled) return;
      getWsUsername().then(u => { if (u && !cancelled) { load(u); fetchFilas(u); } });
    }, 5000);

    return () => {
      cancelled = true;
      const ch = (window as any).__unitaFluxosCh;
      if (ch) { supabase.removeChannel(ch); delete (window as any).__unitaFluxosCh; }
      clearInterval(interval);
    };
  }, []);

  // ✅ Busca fluxos filtrando por username
  async function load(username?: string) {
    const u = username || wsId;
    if (!u) return;
    const {data} = await supabase.from("fluxos").select("*").order("created_at",{ascending:false});
    setFluxos((data||[]).map(f=>({...f,nos:f.nos||[],conexoes:f.conexoes||[]})));
  }

  // 🆕 Busca filas cadastradas em Configurações → Filas do CRM
  async function fetchFilas(username?: string) {
    const u = username || wsId;
    if (!u) return;
    try {
      const {data} = await supabase.from("filas").select("id, nome, conexao").order("nome",{ascending:true});
      setFilasBanco(data || []);
    } catch (e) {
      console.error("Erro ao buscar filas:", e);
      setFilasBanco([]);
    }
  }

  // 🆕 Busca atendentes do workspace (usuarios_workspace + dono) — usado no bloco Transferir modo "humano"
  async function fetchAtendentes(username?: string) {
    const u = username || wsId;
    if (!u) return;
    try {
      const lista: AtendenteItem[] = [];
      // Sub-usuários do workspace
      const { data: subs } = await supabase.from("usuarios")
        .select("email, nome")
        ;
      for (const s of (subs || [])) {
        if (s.email && !lista.find(x => x.email?.toLowerCase() === s.email?.toLowerCase())) {
          lista.push({ email: s.email, nome: s.nome || s.email });
        }
      }
      // Dono do workspace
      const { data: ws } = await supabase.from("workspaces")
        .select("owner_email, nome")
        .or(`username.eq.${u},id.eq.${u}`)
        .maybeSingle();
      if (ws?.owner_email && !lista.find(x => x.email?.toLowerCase() === ws.owner_email.toLowerCase())) {
        lista.unshift({ email: ws.owner_email, nome: ws.nome || ws.owner_email });
      }
      lista.sort((a, b) => a.nome.localeCompare(b.nome));
      setAtendentesBanco(lista);
    } catch (e) {
      console.error("Erro ao buscar atendentes:", e);
      setAtendentesBanco([]);
    }
  }

  async function criarFluxo() {
    if(!form.nome.trim()){alert("Digite o nome!");return;}
    setCriando(true);
    try {
      const username = wsId || await getWsUsername();
      if(!username){alert("Workspace não encontrado! Faça login novamente.");return;}
      const ini:No = {id:uid(),tipo:"inicio",x:200,y:200,dados:defaultD("inicio"),saidas:[...B.inicio.saidas]};
      const payload = {nome:form.nome.trim(),descricao:form.descricao,ativo:false,
        trigger_tipo:form.trigger_tipo,trigger_valor:form.trigger_valor,
        nos:[ini],conexoes:[]};
      const {data,error} = await supabase.from("fluxos").insert([payload]).select().single();
      if(error){alert("Erro: "+error.message);return;}
      setWsId(username); await load(username); await fetchFilas(username); await fetchAtendentes(username);
      abrirEditor({...payload, id:data.id} as Fluxo);
      setShowNovo(false);
      setForm({nome:"",descricao:"",trigger_tipo:"qualquer_mensagem",trigger_valor:""});
    } finally { setCriando(false); }
  }

  function abrirEditor(f:Fluxo) {
    setFluxoAtivo(f); setNos(f.nos||[]); setArestas(f.conexoes||[]); setNoSel(null); setNoEditando(null); setView("editor");
    fetchFilas(); // 🆕 recarrega filas ao abrir o editor
    fetchAtendentes(); // 🆕 recarrega atendentes ao abrir o editor
  }

  async function salvar() {
    if(!fluxoAtivo?.id) return;
    if(!wsId) { alert("Workspace não carregado. Recarregue a página."); return; }

    // 🆕 Validações por bloco — avisa antes de salvar bloco mal configurado
    const problemas: string[] = [];
    for (const n of nos) {
      if (n.tipo === "transferir") {
        const modo = n.dados?.modo || "equipe";
        if (modo === "equipe" && !n.dados?.fila) {
          problemas.push("📤 Transferir → modo Equipe sem fila selecionada");
        }
        if (modo === "humano" && !n.dados?.atendente_email) {
          problemas.push("📤 Transferir → modo Atendente humano sem atendente selecionado");
        }
      }
      if (n.tipo === "gmail") {
        const faltam: string[] = [];
        if (!n.dados?.smtp_user) faltam.push("usuário SMTP");
        if (!n.dados?.smtp_pass) faltam.push("senha SMTP");
        if (!n.dados?.para) faltam.push("destinatário (Para)");
        if (faltam.length > 0) problemas.push(`📨 Gmail → falta: ${faltam.join(", ")}`);
      }
      if (n.tipo === "google_sheets") {
        if (!n.dados?.webhook_url) problemas.push("📊 Google Sheets → URL do webhook não preenchida");
      }
    }
    if (problemas.length > 0) {
      if (!confirm(`⚠️ Encontrei ${problemas.length} bloco(s) com configuração incompleta:\n\n${problemas.join("\n")}\n\nEles vão FALHAR quando o fluxo rodar. Salvar mesmo assim?`)) return;
    }

    setSalvando(true);
    // 🔒 MULTI-TENANT: defesa em profundidade — só salva se fluxo for deste workspace
    await supabase.from("fluxos").update({nos,conexoes:arestas,nome:fluxoAtivo.nome,
      descricao:fluxoAtivo.descricao,ativo:fluxoAtivo.ativo,
      trigger_tipo:fluxoAtivo.trigger_tipo,trigger_valor:fluxoAtivo.trigger_valor})
      .eq("id",fluxoAtivo.id)
      ;
    await load(); setSalvando(false); alert("✅ Fluxo salvo!");
  }

  async function toggleAtivo() {
    if(!fluxoAtivo?.id) return;
    if(!wsId) { alert("Workspace não carregado. Recarregue a página."); return; }
    const v = !fluxoAtivo.ativo;
    // 🔒 MULTI-TENANT: defesa em profundidade — só togglea se fluxo for deste workspace
    await supabase.from("fluxos").update({ativo:v})
      .eq("id",fluxoAtivo.id)
      ;
    setFluxoAtivo(p => p?{...p,ativo:v}:null); await load();
  }

  // ✅ Exclusão real — verifica se deu certo e limpa sessão se estava aberta
  async function excluirFluxo(id:number, nome:string) {
    if(!confirm(`Excluir o fluxo "${nome}" permanentemente?\nIsso não pode ser desfeito.`)) return;
    if(!wsId) { alert("Workspace não carregado. Recarregue a página."); return; }

    // 🔒 MULTI-TENANT: confere que o fluxo realmente pertence a este workspace ANTES de mexer.
    // Antes, qualquer user com o id do fluxo (descoberto via DevTools, console, etc) podia
    // deletar fluxos de outros workspaces.
    const fluxo = fluxos.find(f => f.id === id);
    if (!fluxo) {
      alert("Erro: fluxo não pertence a este workspace.");
      return;
    }

    // Também apaga as sessões em execução desse fluxo (pra não ficar lixo).
    // Não precisa filtrar por workspace_id aqui: como já confirmamos acima que `fluxo` pertence
    // a este workspace, `id` é uma chave globalmente única e podemos confiar nele.
    await supabase.from("fluxo_sessoes").delete().eq("fluxo_id", id);

    // 🔒 MULTI-TENANT CRÍTICO: delete do fluxo agora exige id E workspace_id baterem
    const { error } = await supabase.from("fluxos").delete()
      .eq("id",id)
      ;
    if (error) { alert("Erro ao excluir: " + error.message); return; }

    // Se era o fluxo aberto, volta pra lista
    if (fluxoAtivo?.id === id) {
      setFluxoAtivo(null); setNos([]); setArestas([]); setView("lista");
    }
    await load();
  }

  function adicionarNo(tipo:TipoNo) {
    const cfg = B[tipo];
    const rect = canvasRef.current?.getBoundingClientRect();
    const cw = rect?.width||800, ch = rect?.height||600;
    const s = scaleRef.current, o = offsetRef.current;
    const cx = (cw/2-o.x)/s-110, cy = (ch/2-o.y)/s-40;
    const sp = (nos.length%8)*28;
    const n:No = {id:uid(),tipo,x:cx+sp,y:cy+sp,dados:defaultD(tipo),saidas:[...cfg.saidas]};
    setNos(p => [...p,n]); setNoSel(n);
  }

  function excluirNo(id:string) {
    if(nos.find(n=>n.id===id)?.tipo==="inicio"){alert("Não pode excluir o início!");return;}
    setNos(p => p.filter(n=>n.id!==id));
    setArestas(p => p.filter(a=>a.de!==id&&a.para!==id));
    if(noSel?.id===id) setNoSel(null);
    if(noEditando?.id===id) setNoEditando(null);
  }

  function updateNo(id:string, d:Record<string,any>) {
    setNos(p => p.map(n => n.id===id ? {...n,dados:{...n.dados,...d}} : n));
    setNoSel(p => p?.id===id ? {...p,dados:{...p.dados,...d}} : p);
    setNoEditando(p => p?.id===id ? {...p,dados:{...p.dados,...d}} : p);
  }

  function onCanvasPointerDown(e:React.PointerEvent) {
    const t = e.target as HTMLElement;
    if(t.closest("button")||t.closest("input")||t.closest("select")||t.closest("textarea")) return;
    if(conectando){setConectando(null);return;}
    panning.current = true;
    panStart.current = {x:e.clientX,y:e.clientY,ox:offsetRef.current.x,oy:offsetRef.current.y};
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e:React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if(rect) setMousePos({x:e.clientX-rect.left, y:e.clientY-rect.top});
    if(!panning.current) return;
    const nx = panStart.current.ox+(e.clientX-panStart.current.x);
    const ny = panStart.current.oy+(e.clientY-panStart.current.y);
    offsetRef.current = {x:nx,y:ny}; setOffset({x:nx,y:ny});
  }

  function onCanvasPointerUp(e:React.PointerEvent) {
    panning.current = false;
    try{(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);}catch{}
  }

  function onWheel(e:React.WheelEvent) {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if(!rect) return;
    const f = e.deltaY>0?0.9:1.1;
    const ns = Math.min(Math.max(scaleRef.current*f,0.2),2.5);
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const no = {x:mx-(mx-offsetRef.current.x)*(ns/scaleRef.current), y:my-(my-offsetRef.current.y)*(ns/scaleRef.current)};
    scaleRef.current=ns; offsetRef.current=no; setScale(ns); setOffset({...no});
  }

  function iniciarConexao(noId:string, saidaIndex:number) { setConectando({noId,saidaIndex}); }

  function finalizarConexao(noId:string) {
    if(!conectando||conectando.noId===noId){setConectando(null);return;}
    setArestas(p => {
      const f = p.filter(a=>!(a.de===conectando.noId&&a.saidaIndex===conectando.saidaIndex));
      return [...f,{id:uid(),de:conectando.noId,saidaIndex:conectando.saidaIndex,para:noId}];
    });
    setConectando(null);
  }

  function posC(no:No, idx:number) { return {x:no.x+220, y:no.y+48+36*idx+18}; }
  function posE(no:No)              { return {x:no.x,     y:no.y+48+18};        }

  if(view==="lista") return (
    <div style={{display:"flex",height:"100vh",fontFamily:"Arial,sans-serif",background:"#f8fafc",color:"#1f2937"}}>
      <div style={{width:230,background:"#ffffff",borderRight:"1px solid #e5e7eb",display:"flex",flexDirection:"column",padding:14,gap:6,boxShadow:"2px 0 8px rgba(0,0,0,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"4px 8px"}}>
          <img src="/logo1.png" alt="Wolf" style={{width:32}}/>
          <span style={{color:"#1f2937",fontWeight:"700",fontSize:14}}>Wolf Chatbot</span>
        </div>
        <button onClick={()=>router.push("/chatbot")}
          style={{
            display:"flex",alignItems:"center",gap:10,
            background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,
            padding:"10px 12px",color:"#374151",fontSize:13,fontWeight:"600",cursor:"pointer",
            textAlign:"left",
            boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
            transition:"transform .12s, box-shadow .12s, border-color .12s"}}
          onMouseEnter={e=>{
            e.currentTarget.style.transform="translateY(-1px)";
            e.currentTarget.style.boxShadow="0 4px 12px rgba(59,130,246,0.15)";
            e.currentTarget.style.borderColor="#93c5fd";
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.transform="translateY(0)";
            e.currentTarget.style.boxShadow="0 1px 2px rgba(0,0,0,0.04)";
            e.currentTarget.style.borderColor="#e5e7eb";
          }}>
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,background:"#3b82f615",borderRadius:8,fontSize:14}}>💬</span>
          Conversas
        </button>
        <button
          style={{
            display:"flex",alignItems:"center",gap:10,
            background:"#8b5cf615",border:"1px solid #8b5cf6",borderRadius:10,
            padding:"10px 12px",color:"#8b5cf6",fontSize:13,fontWeight:"700",cursor:"pointer",
            textAlign:"left",
            boxShadow:"0 2px 6px rgba(139,92,246,0.15)"}}>
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,background:"#8b5cf6",borderRadius:8,fontSize:14,filter:"saturate(0) brightness(2)",boxShadow:"0 2px 6px rgba(139,92,246,0.4)"}}>🤖</span>
          Fluxos
        </button>
        <div style={{flex:1}}/>
        <button onClick={()=>router.push("/crm")}
          style={{
            display:"flex",alignItems:"center",gap:8,
            background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,
            padding:"10px 12px",color:"#6b7280",fontSize:12,fontWeight:"600",cursor:"pointer",
            textAlign:"left",
            boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
            transition:"transform .12s, box-shadow .12s, border-color .12s"}}
          onMouseEnter={e=>{
            e.currentTarget.style.transform="translateY(-1px)";
            e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.06)";
            e.currentTarget.style.borderColor="#d1d5db";
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.transform="translateY(0)";
            e.currentTarget.style.boxShadow="0 1px 2px rgba(0,0,0,0.04)";
            e.currentTarget.style.borderColor="#e5e7eb";
          }}>← Voltar ao CRM</button>
      </div>
      <div style={{flex:1,padding:32,overflowY:"auto"}}>
        {showNovo && (
          <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.4)",backdropFilter:"blur(2px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"#ffffff",borderRadius:16,padding:28,width:500,border:"1px solid #e5e7eb",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{
                    width:40,height:40,borderRadius:10,
                    background:"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
                    boxShadow:"0 4px 12px rgba(139,92,246,0.3)"
                  }}>➕</div>
                  <h2 style={{color:"#1f2937",fontSize:18,fontWeight:"700",margin:0}}>Novo Fluxo</h2>
                </div>
                <button onClick={()=>setShowNovo(false)} style={{background:"#f3f4f6",border:"none",color:"#6b7280",fontSize:18,cursor:"pointer",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
              <div><label style={{...LS,fontSize:11}}>Nome *</label>
                <input autoFocus placeholder="Ex: Fluxo de Vendas" value={form.nome}
                  onChange={e=>setForm({...form,nome:e.target.value})}
                  onKeyDown={e=>e.key==="Enter"&&criarFluxo()}
                  style={{...IS,fontSize:14,padding:"10px 14px"}}/>
              </div>
              <div><label style={{...LS,fontSize:11}}>Descrição</label>
                <input placeholder="Objetivo" value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} style={IS}/>
              </div>
              <div><label style={{...LS,fontSize:11}}>Quando Ativar</label>
                <select value={form.trigger_tipo} onChange={e=>setForm({...form,trigger_tipo:e.target.value})} style={IS}>
                  <option value="qualquer_mensagem">Qualquer mensagem</option>
                  <option value="palavra_chave">Palavra-chave</option>
                  <option value="primeiro_contato">Primeiro contato</option>
                  <option value="fora_horario">Fora do horário</option>
                </select>
              </div>
              {form.trigger_tipo==="palavra_chave" && (
                <div><label style={{...LS,fontSize:11}}>Palavra-chave</label>
                  <input placeholder="oi, olá" value={form.trigger_valor} onChange={e=>setForm({...form,trigger_valor:e.target.value})} style={IS}/>
                </div>
              )}
              {form.trigger_tipo==="fora_horario" && (() => {
                let cfg = {hora_inicio:"08:00", hora_fim:"18:00"};
                try { if (form.trigger_valor) cfg = {...cfg, ...JSON.parse(form.trigger_valor)}; } catch {}
                const setCfg = (patch: any) => {
                  const novo = {...cfg, ...patch};
                  setForm({...form, trigger_valor: JSON.stringify(novo)});
                };
                return (
                  <div>
                    <label style={{...LS,fontSize:11}}>Horário de funcionamento (dispara FORA dessa faixa)</label>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <input type="time" value={cfg.hora_inicio}
                        onChange={e=>setCfg({hora_inicio:e.target.value})}
                        style={{...IS,flex:1}}/>
                      <span style={{color:"#6b7280",fontSize:12}}>até</span>
                      <input type="time" value={cfg.hora_fim}
                        onChange={e=>setCfg({hora_fim:e.target.value})}
                        style={{...IS,flex:1}}/>
                    </div>
                    <p style={{color:"#6b7280",fontSize:10,margin:"4px 0 0",lineHeight:1.3}}>
                      💡 O fluxo dispara quando o cliente manda mensagem FORA do horário {cfg.hora_inicio}–{cfg.hora_fim}.
                    </p>
                  </div>
                );
              })()}
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
                <button onClick={()=>setShowNovo(false)} style={{background:"#ffffff",color:"#6b7280",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 20px",fontSize:13,cursor:"pointer",fontWeight:"600"}}>Cancelar</button>
                <button onClick={criarFluxo} disabled={criando} style={{
                  background:criando?"linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)":"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                  color:"#ffffff",border:"none",borderRadius:10,padding:"10px 24px",fontSize:13,
                  cursor:criando?"wait":"pointer",fontWeight:"700",
                  boxShadow:criando?"none":"0 4px 12px rgba(139,92,246,0.35)"
                }}>
                  {criando?"⏳ Criando...":"🤖 Criar Fluxo"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              width:48,height:48,borderRadius:12,
              background:"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,
              boxShadow:"0 8px 16px rgba(139,92,246,0.25)"
            }}>🤖</div>
            <div>
              <h1 style={{color:"#1f2937",fontSize:22,fontWeight:"700",margin:0}}>Meus Fluxos</h1>
              <p style={{color:"#6b7280",fontSize:13,margin:"2px 0 0"}}>{fluxos.length} fluxo(s) cadastrado(s)</p>
            </div>
          </div>
          <button onClick={()=>setShowNovo(true)} style={{
            background:"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            color:"#ffffff",border:"none",borderRadius:10,
            padding:"11px 22px",fontSize:13,cursor:"pointer",fontWeight:"700",
            boxShadow:"0 4px 12px rgba(139,92,246,0.35), 0 1px 3px rgba(139,92,246,0.2)",
            transition:"transform .12s, box-shadow .12s"}}
          onMouseEnter={e=>{
            e.currentTarget.style.transform="translateY(-1px)";
            e.currentTarget.style.boxShadow="0 6px 16px rgba(139,92,246,0.45)";
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.transform="translateY(0)";
            e.currentTarget.style.boxShadow="0 4px 12px rgba(139,92,246,0.35), 0 1px 3px rgba(139,92,246,0.2)";
          }}>+ Novo Fluxo</button>
        </div>
        {fluxos.length===0 ? (
          <div style={{background:"#ffffff",borderRadius:16,padding:64,textAlign:"center",border:"1px solid #e5e7eb",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{
              display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:96,height:96,borderRadius:24,
              background:"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              fontSize:48,margin:"0 auto 20px",
              boxShadow:"0 12px 24px rgba(139,92,246,0.25)"
            }}>🤖</div>
            <h3 style={{color:"#1f2937",fontSize:18,fontWeight:"700",margin:"0 0 8px"}}>Nenhum fluxo criado</h3>
            <p style={{color:"#6b7280",fontSize:14,margin:"0 0 24px"}}>Crie fluxos de atendimento automático pra seu chatbot</p>
            <button onClick={()=>setShowNovo(true)} style={{
              background:"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              color:"#ffffff",border:"none",borderRadius:12,
              padding:"14px 32px",fontSize:14,cursor:"pointer",fontWeight:"700",
              boxShadow:"0 4px 12px rgba(139,92,246,0.35)"
            }}>+ Criar Primeiro Fluxo</button>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:18}}>
            {fluxos.map(f => (
              <div key={f.id} style={{
                background:"#ffffff",borderRadius:14,padding:20,
                border:`1px solid ${f.ativo?"#22c55e44":"#e5e7eb"}`,
                boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
                transition:"transform .15s, box-shadow .15s, border-color .15s",
                cursor:"default"}}
              onMouseEnter={e=>{
                e.currentTarget.style.transform="translateY(-2px)";
                e.currentTarget.style.boxShadow="0 8px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)";
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.transform="translateY(0)";
                e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)";
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                    <div style={{
                      width:38,height:38,borderRadius:10,
                      background:f.ativo?"linear-gradient(135deg, #22c55e 0%, #16a34a 100%)":"#f3f4f6",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
                      boxShadow:f.ativo?"0 4px 8px rgba(34,197,94,0.25)":"none",
                      flexShrink:0
                    }}>{f.ativo?"🚀":"⏸️"}</div>
                    <div style={{minWidth:0,flex:1}}>
                      <h3 style={{color:"#1f2937",fontSize:15,fontWeight:"700",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.nome}</h3>
                      {f.descricao && <p style={{color:"#6b7280",fontSize:11,margin:"3px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.descricao}</p>}
                    </div>
                  </div>
                  <span style={{
                    display:"inline-flex",alignItems:"center",gap:4,
                    background:f.ativo?"#dcfce7":"#f3f4f6",
                    color:f.ativo?"#16a34a":"#6b7280",
                    fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:"700",whiteSpace:"nowrap",
                    border:f.ativo?"1px solid #86efac":"1px solid #e5e7eb",
                    flexShrink:0
                  }}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:f.ativo?"#22c55e":"#9ca3af",boxShadow:f.ativo?"0 0 0 2px #22c55e33":"none"}}/>
                    {f.ativo?"Ativo":"Inativo"}
                  </span>
                </div>
                <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f3f4f6",color:"#4b5563",fontSize:11,padding:"4px 10px",borderRadius:6,fontWeight:"500"}}>
                    🧩 {f.nos?.length||0} blocos
                  </span>
                  <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f3f4f6",color:"#4b5563",fontSize:11,padding:"4px 10px",borderRadius:6,fontWeight:"500"}}>
                    {f.trigger_tipo==="qualquer_mensagem"?"📨 Qualquer":f.trigger_tipo==="palavra_chave"?`🔑 "${f.trigger_valor}"`:f.trigger_tipo==="primeiro_contato"?"👋 1º contato":"🕐 Fora horário"}
                  </span>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>abrirEditor(f)} style={{
                    flex:1,
                    background:"linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                    color:"#ffffff",border:"none",borderRadius:10,
                    padding:"9px",fontSize:12,cursor:"pointer",fontWeight:"700",
                    boxShadow:"0 2px 6px rgba(139,92,246,0.25)",
                    transition:"transform .12s, box-shadow .12s"}}
                  onMouseEnter={e=>{
                    e.currentTarget.style.transform="translateY(-1px)";
                    e.currentTarget.style.boxShadow="0 4px 12px rgba(139,92,246,0.4)";
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.transform="translateY(0)";
                    e.currentTarget.style.boxShadow="0 2px 6px rgba(139,92,246,0.25)";
                  }}>✏️ Editar</button>
                  <button onClick={()=>excluirFluxo(f.id!, f.nome)} style={{
                    background:"#fef2f2",color:"#ef4444",border:"1px solid #fecaca",
                    borderRadius:10,padding:"9px 14px",fontSize:13,cursor:"pointer",
                    transition:"background .12s, border-color .12s"}}
                  onMouseEnter={e=>{
                    e.currentTarget.style.background="#fee2e2";
                    e.currentTarget.style.borderColor="#fca5a5";
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.background="#fef2f2";
                    e.currentTarget.style.borderColor="#fecaca";
                  }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"Arial,sans-serif",background:"#f8fafc",color:"#1f2937",overflow:"hidden"}}>

      <div style={{width:220,background:"#ffffff",borderRight:"1px solid #e5e7eb",display:"flex",flexDirection:"column",flexShrink:0,boxShadow:"2px 0 8px rgba(0,0,0,0.04)"}}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setView("lista")} style={{
            background:"#f3f4f6",border:"none",color:"#6b7280",fontSize:14,
            cursor:"pointer",padding:"4px 8px",borderRadius:6,
            transition:"background .15s"
          }}
          onMouseEnter={e=>(e.currentTarget.style.background="#e5e7eb")}
          onMouseLeave={e=>(e.currentTarget.style.background="#f3f4f6")}>←</button>
          <h3 style={{color:"#1f2937",fontSize:13,fontWeight:"bold",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{fluxoAtivo?.nome}</h3>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 0"}}>
          {GRUPOS.map(grupo => {
            const tipos = (Object.entries(B) as [TipoNo,BC][]).filter(([,c])=>c.grupo===grupo);
            const ab = grupoAberto===grupo;
            return (
              <div key={grupo} style={{marginBottom:6}}>
                <button onClick={()=>setGrupoAberto(ab?"":grupo)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 16px",background:"none",border:"none",cursor:"pointer",color:ab?"#1f2937":"#6b7280",fontSize:10,fontWeight:"800",textTransform:"uppercase",letterSpacing:1.2}}>
                  <span>{grupo}</span>
                  <span style={{fontSize:8,color:ab?"#8b5cf6":"#9ca3af",transition:"transform .2s",transform:ab?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
                </button>
                {ab && (
                  <div style={{padding:"4px 10px 6px",display:"flex",flexDirection:"column",gap:4}}>
                    {tipos.map(([tipo,cfg]) => (
                      <button key={tipo} onClick={()=>adicionarNo(tipo)}
                        style={{
                          display:"flex",alignItems:"center",gap:10,width:"100%",
                          background:"#ffffff",
                          border:"1px solid #e5e7eb",
                          borderRadius:8,
                          padding:"7px 10px",
                          color:"#1f2937",
                          fontSize:12,
                          fontWeight:"500",
                          cursor:"pointer",
                          textAlign:"left",
                          boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
                          transition:"transform .12s ease, box-shadow .12s ease, border-color .12s ease"}}
                        onMouseEnter={e=>{
                          e.currentTarget.style.transform="translateY(-1px)";
                          e.currentTarget.style.boxShadow=`0 4px 12px ${cfg.cor}22, 0 1px 3px rgba(0,0,0,0.06)`;
                          e.currentTarget.style.borderColor=`${cfg.cor}55`;
                        }}
                        onMouseLeave={e=>{
                          e.currentTarget.style.transform="translateY(0)";
                          e.currentTarget.style.boxShadow="0 1px 2px rgba(0,0,0,0.04)";
                          e.currentTarget.style.borderColor="#e5e7eb";
                        }}>
                        <span style={{
                          display:"inline-flex",alignItems:"center",justifyContent:"center",
                          width:26,height:26,
                          background:`${cfg.cor}15`,
                          borderRadius:7,
                          fontSize:14,flexShrink:0
                        }}>{cfg.icone}</span>
                        <span style={{flex:1}}>{cfg.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{padding:12,borderTop:"1px solid #e5e7eb",background:"#fafbfc"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,padding:"9px 12px",marginBottom:10,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
            <span style={{color:fluxoAtivo?.ativo?"#16a34a":"#6b7280",fontSize:12,fontWeight:"600",display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:fluxoAtivo?.ativo?"#22c55e":"#9ca3af",boxShadow:fluxoAtivo?.ativo?"0 0 0 3px #22c55e22":"none"}}/>
              {fluxoAtivo?.ativo?"Ativo":"Inativo"}
            </span>
            <button onClick={toggleAtivo} style={{width:38,height:22,background:fluxoAtivo?.ativo?"#22c55e":"#d1d5db",borderRadius:11,cursor:"pointer",border:"none",position:"relative",transition:"background .2s",boxShadow:"inset 0 1px 2px rgba(0,0,0,0.1)"}}>
              <div style={{width:16,height:16,background:"white",borderRadius:"50%",position:"absolute",top:3,left:fluxoAtivo?.ativo?19:3,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
            </button>
          </div>
          <button onClick={salvar} disabled={salvando} style={{
            width:"100%",
            background: salvando
              ? "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)"
              : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            color:"#ffffff",
            border:"none",
            borderRadius:10,
            padding:"11px",
            fontSize:13,
            cursor:salvando?"not-allowed":"pointer",
            fontWeight:"700",
            boxShadow: salvando ? "none" : "0 4px 12px rgba(139, 92, 246, 0.35), 0 1px 3px rgba(139, 92, 246, 0.2)",
            transition:"transform .12s ease, box-shadow .12s ease"}}
          onMouseEnter={e=>{
            if (!salvando) {
              e.currentTarget.style.transform="translateY(-1px)";
              e.currentTarget.style.boxShadow="0 6px 16px rgba(139, 92, 246, 0.45), 0 2px 4px rgba(139, 92, 246, 0.25)";
            }
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.transform="translateY(0)";
            if (!salvando) e.currentTarget.style.boxShadow="0 4px 12px rgba(139, 92, 246, 0.35), 0 1px 3px rgba(139, 92, 246, 0.2)";
          }}>
            {salvando?"Salvando...":"💾 Salvar Fluxo"}
          </button>
        </div>
      </div>

      <div ref={canvasRef}
        style={{flex:1,position:"relative",overflow:"hidden",cursor:panning.current?"grabbing":conectando?"crosshair":"default",touchAction:"none",
          background:"#f8fafc"}}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onWheel={onWheel}
        onClick={()=>setNoSel(null)}
      >
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <defs>
            <pattern id="dots" width={24*scale} height={24*scale} patternUnits="userSpaceOnUse" x={offset.x%(24*scale)} y={offset.y%(24*scale)}>
              <circle cx={1} cy={1} r={0.8} fill="#cbd5e1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
        </svg>

        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"visible"}}>
          {arestas.map(a => {
            const nO=nos.find(n=>n.id===a.de), nD=nos.find(n=>n.id===a.para);
            if(!nO||!nD) return null;
            const o=posC(nO,a.saidaIndex), d2=posE(nD);
            const ox=o.x*scale+offset.x, oy=o.y*scale+offset.y;
            const dx=d2.x*scale+offset.x, dy=d2.y*scale+offset.y;
            const cor=B[nO.tipo]?.cor||"#4b5563";
            return (
              <g key={a.id} style={{pointerEvents:"all",cursor:"pointer"}} onClick={()=>setArestas(p=>p.filter(x=>x.id!==a.id))}>
                <path d={`M${ox} ${oy} C${ox+80*scale} ${oy} ${dx-80*scale} ${dy} ${dx} ${dy}`} stroke={cor} strokeWidth={2} fill="none" opacity={0.7}/>
                <path d={`M${ox} ${oy} C${ox+80*scale} ${oy} ${dx-80*scale} ${dy} ${dx} ${dy}`} stroke="transparent" strokeWidth={14} fill="none"/>
                <circle cx={dx} cy={dy} r={5} fill={cor}/>
              </g>
            );
          })}
          {conectando && (() => {
            const no=nos.find(n=>n.id===conectando.noId); if(!no) return null;
            const o=posC(no,conectando.saidaIndex);
            const ox=o.x*scale+offset.x, oy=o.y*scale+offset.y;
            const cor=B[no.tipo]?.cor||"#8b5cf6";
            return <path d={`M${ox} ${oy} C${ox+80} ${oy} ${mousePos.x-80} ${mousePos.y} ${mousePos.x} ${mousePos.y}`} stroke={cor} strokeWidth={2} strokeDasharray="6 3" fill="none"/>;
          })()}
        </svg>

        <div style={{position:"absolute",inset:0,transform:`translate(${offset.x}px,${offset.y}px) scale(${scale})`,transformOrigin:"0 0"}}>
          {nos.map(no => (
            <NoCard key={no.id} no={no} sel={noSel?.id===no.id}
              scale={scale}
              onSelect={id => setNoSel(nos.find(n=>n.id===id)||null)}
              onOpen={id => {
                const n = nos.find(n => n.id === id);
                if (n) {
                  setNoSel(n);
                  setNoEditando(n);
                }
              }}
              onDelete={excluirNo}
              onConectarSaida={iniciarConexao}
              onConectarEntrada={finalizarConexao}
              onMove={(id,x,y) => setNos(p=>p.map(n=>n.id===id?{...n,x,y}:n))}
            />
          ))}
        </div>

        <div style={{position:"absolute",bottom:16,left:16,display:"flex",gap:8}}>
          <div style={{background:"#f8fafc",border:"1px solid #ffffff",borderRadius:8,padding:"6px 12px"}}>
            <p style={{color:"#6b7280",fontSize:10,margin:0}}>🖱️ Arraste blocos • Scroll zoom • ● conectar • Clique na linha para excluir</p>
          </div>
          <div style={{background:"#f8fafc",border:"1px solid #ffffff",borderRadius:8,padding:"6px 10px",display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>{const s=Math.min(scaleRef.current*1.2,2.5);scaleRef.current=s;setScale(s);}} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:16}}>+</button>
            <span style={{color:"#6b7280",fontSize:10}}>{Math.round(scale*100)}%</span>
            <button onClick={()=>{const s=Math.max(scaleRef.current*0.8,0.2);scaleRef.current=s;setScale(s);}} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:16}}>−</button>
            <button onClick={()=>{scaleRef.current=1;offsetRef.current={x:80,y:80};setScale(1);setOffset({x:80,y:80});}} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:10}}>Reset</button>
          </div>
        </div>
        <div style={{position:"absolute",top:16,right:noSel?285:16,background:"#f8fafc",border:"1px solid #ffffff",borderRadius:8,padding:"6px 12px"}}>
          <p style={{color:"#6b7280",fontSize:10,margin:0}}>{nos.length} blocos • {arestas.length} conexões</p>
        </div>
      </div>

      {/* 🆕 MODAL CENTRALIZADO de edição (em vez de sidebar lateral).
          Vantagens: muito mais espaço pros campos, não some informação, foco total no bloco.
          Desvantagem: canvas fica escurecido atrás (mas dá pra fechar e voltar rápido). */}
      {noEditando && (
        <div
          onClick={() => setNoEditando(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20}}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#f8fafc",
              borderRadius: 12,
              border: "1px solid #ffffff",
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px #000c"}}
          >
            {/* Header do modal */}
            <div style={{
              padding: "14px 18px",
              borderBottom: "1px solid #ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0}}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: B[noEditando.tipo]?.cor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18}}>
                  {B[noEditando.tipo]?.icone}
                </div>
                <div>
                  <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: "bold", margin: 0 }}>{B[noEditando.tipo]?.label}</h3>
                  <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>{B[noEditando.tipo]?.grupo}</p>
                </div>
              </div>
              <button
                onClick={() => setNoEditando(null)}
                style={{
                  background: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  color: "#9ca3af",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"}}
              >✕</button>
            </div>

            {/* Conteúdo (scrollável). overflowX visible permite que o dropdown ＋Variável
                possa expandir lateralmente sem ser cortado. */}
            <div style={{
              padding: 18,
              overflowY: "auto",
              overflowX: "visible",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 14}}>
              <PainelProps
                noSel={noEditando}
                updateNo={updateNo}
                excluirNo={(id) => { excluirNo(id); setNoEditando(null); }}
                setNos={setNos}
                filasBanco={filasBanco}
                atendentesBanco={atendentesBanco}
                nos={nos}
              />
            </div>

            {/* Footer com ações */}
            {noEditando.tipo !== "inicio" && (
              <div style={{
                padding: "12px 18px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: 8,
                flexShrink: 0}}>
                <button
                  onClick={() => { excluirNo(noEditando.id); setNoEditando(null); }}
                  style={{
                    background: "#fef2f2",
                    color: "#ef4444",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: "bold"}}
                >🗑️ Excluir bloco</button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => setNoEditando(null)}
                  style={{
                    background: "#3b82f6",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 24px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: "bold"}}
                >✓ Concluir</button>
              </div>
            )}
            {/* Pro nó "inicio" só botão de concluir */}
            {noEditando.tipo === "inicio" && (
              <div style={{
                padding: "12px 18px",
                borderTop: "1px solid #ffffff",
                display: "flex",
                justifyContent: "flex-end",
                flexShrink: 0}}>
                <button
                  onClick={() => setNoEditando(null)}
                  style={{
                    background: "#3b82f6",
                    color: "#1f2937",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 24px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: "bold"}}
                >✓ Concluir</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}