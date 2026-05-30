// ═══════════════════════════════════════════════════════════════════════
// 🌐 TRADUTOR DE ERROS TÉCNICOS → PT AMIGÁVEL — UnitaSystem
// ═══════════════════════════════════════════════════════════════════════
// Recebe qualquer erro (string, Error, response JSON, etc) e devolve
// uma mensagem amigável pra mostrar pro usuário final.
// ═══════════════════════════════════════════════════════════════════════

export function traduzirErro(err: any): string {
  if (!err) return "Ocorreu um erro inesperado. Tente novamente.";

  let msg = "";
  let codigo: number | string | undefined;

  if (typeof err === "string") {
    msg = err;
  } else if (err.error) {
    msg = String(err.error);
    codigo = err.codigo ?? err.code;
  } else if (err.message) {
    msg = String(err.message);
    codigo = err.code;
  } else if (err.statusText) {
    msg = String(err.statusText);
    codigo = err.status;
  } else {
    try { msg = JSON.stringify(err); } catch { msg = String(err); }
  }

  const subcode = Number(err?.error_subcode ?? err?.subcodigo);
  if (subcode === 2388001) return "A conta business da Meta não atende aos requisitos de política do WhatsApp. Abra um chamado no Meta Business Suite (Recursos → Falar com suporte) com o fbtrace_id deste erro.";
  if (subcode === 2388023) return "Display Name do WhatsApp foi rejeitado. Altere no Meta Business Manager pra um nome que represente a empresa.";
  if (subcode === 2388092) return "Verificação da empresa pendente na Meta. Complete a Business Verification antes de registrar o número.";
  if (subcode === 2388013) return "Número já em uso em outra conta Business da Meta. Migre o número ou use outro.";

  const titleMeta = err?.error_user_title;
  const msgMeta = err?.error_user_msg;
  if (titleMeta && typeof titleMeta === "string" && titleMeta.length < 100) {
    return titleMeta + (msgMeta && msgMeta.length < 300 ? ` — ${msgMeta}` : "");
  }

  const m = msg.toLowerCase();

  if (codigo !== undefined) {
    const cod = Number(codigo);
    if (cod === 100)    return "Dado inválido enviado ao WhatsApp. Verifique se o número está em formato internacional e o conteúdo da mensagem.";
    if (cod === 190)    return "A conexão com o WhatsApp expirou. Reconecte o canal nas Configurações.";
    if (cod === 10)     return "Permissão negada pelo WhatsApp. Verifique as permissões do app no Meta Business.";
    if (cod === 4)      return "Limite de chamadas do WhatsApp atingido. Aguarde alguns minutos.";
    if (cod === 17)     return "Limite de uso do WhatsApp atingido por hora. Aguarde.";
    if (cod === 80007)  return "Limite de mensagens do WhatsApp por dia atingido.";
    if (cod === 131000) return "PIN de 2 fatores necessário. Cancele o primeiro popup pra digitar o PIN.";
    if (cod === 131005) return "Acesso negado ao número. Verifique se o número está na sua conta Meta Business.";
    if (cod === 131008) return "Parâmetro obrigatório faltando na requisição.";
    if (cod === 131009) return "Valor do parâmetro inválido.";
    if (cod === 131016) return "Serviço do WhatsApp temporariamente indisponível. Tente novamente em alguns minutos.";
    if (cod === 131021) return "Não é possível enviar mensagem pra si mesmo (mesmo número).";
    if (cod === 131026) return "Mensagem não pode ser entregue — o número pode estar inativo no WhatsApp.";
    if (cod === 131031) return "Conta do WhatsApp Business foi bloqueada pela Meta.";
    if (cod === 131042) return "Falha no pagamento da conta WhatsApp Business. Verifique o método de pagamento na Meta.";
    if (cod === 131045) return "Número ainda não foi registrado. Ative-o primeiro.";
    if (cod === 131047) return "Janela de 24h expirou. Use um template pré-aprovado pra reabrir a conversa.";
    if (cod === 131048) return "Limite de mensagens por taxa atingido. Aguarde e tente novamente.";
    if (cod === 131051) return "Tipo de mensagem não suportado pelo WhatsApp Business.";
    if (cod === 131052) return "Falha ao baixar mídia do cliente. Tente novamente em alguns segundos.";
    if (cod === 131053) return "Falha ao enviar mídia. O arquivo pode estar corrompido ou ser muito grande.";
    if (cod === 131056) return "Limite de mensagens de retomada atingido. Espere antes de reengajar este contato.";
    if (cod === 132000) return "Template do WhatsApp tem parâmetros incompatíveis. Revise o template aprovado.";
    if (cod === 132001) return "Template não existe ou não foi aprovado pela Meta.";
    if (cod === 132005) return "Hash do template não corresponde. O template pode ter sido atualizado.";
    if (cod === 132007) return "Template pausado por baixa qualidade. Aguarde reativação automática pela Meta.";
    if (cod === 132012) return "Parâmetros do template formatados incorretamente.";
    if (cod === 132015) return "Template pausado por desempenho ruim.";
    if (cod === 132016) return "Template foi desativado pela Meta.";
    if (cod === 133000) return "Erro de registro do WhatsApp. Tente desincorporar e reincorporar o número.";
    if (cod === 133004) return "Servidor do WhatsApp temporariamente indisponível.";
    if (cod === 133005) return "PIN de 2 fatores incorreto. Verifique o código no Meta Business.";
    if (cod === 133006) return "Verificação do número falhou. Confirme no Meta Business.";
    if (cod === 133008) return "Tentativas demais. Aguarde algumas horas antes de tentar registrar de novo.";
    if (cod === 133009) return "PIN incorreto demais. Aguarde antes de tentar de novo.";
    if (cod === 133010) return "Número já está registrado nesta conta.";
    if (cod === 133015) return "Aguardando aprovação. Tente novamente em alguns minutos.";
  }

  if (m.includes("invalid parameter")) return "Algum dado enviado está em formato inválido. Verifique e tente de novo.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Você fez muitas requisições em pouco tempo. Aguarde 1-2 minutos e tente novamente.";
  if (m.includes("token") && (m.includes("expired") || m.includes("invalid")))
    return "Token de acesso expirou. Reconecte o canal nas Configurações.";

  if (m.includes("detached frame") || m.includes("frame was detached"))
    return "A sessão desconectou. Vamos reconectar automaticamente em alguns segundos.";
  if (m.includes("session closed") || m.includes("protocol error") || m.includes("target closed"))
    return "Conexão com o navegador foi fechada. Reconecte pra continuar.";

  if (m.includes("auth-token") && m.includes("lock"))
    return "Conexão com o servidor temporariamente lenta. Aguarde alguns segundos e tente novamente.";
  if (m.includes("jwt") && m.includes("expired"))
    return "Sua sessão expirou. Faça login novamente.";
  if (m.includes("row-level security") || m.includes("rls"))
    return "Você não tem permissão pra essa ação. Verifique com o administrador.";
  if (m.includes("violates") && m.includes("not-null"))
    return "Algum campo obrigatório não foi preenchido.";
  if (m.includes("duplicate key") || m.includes("violates unique"))
    return "Esse registro já existe. Use outro valor ou edite o existente.";
  if (m.includes("violates foreign key"))
    return "Referência inválida. O item relacionado não existe ou foi removido.";

  if (m.includes("503") || m.includes("service unavailable"))
    return "Serviço temporariamente indisponível. Tente novamente em alguns segundos.";
  if (m.includes("502") || m.includes("bad gateway"))
    return "Servidor está reiniciando. Aguarde alguns segundos e tente novamente.";
  if (m.includes("504") || m.includes("gateway timeout"))
    return "O servidor demorou demais pra responder. Tente novamente.";
  if (m.includes("500") || m.includes("internal server error"))
    return "Erro no servidor. Se persistir, abra um chamado.";
  if (m.includes("401") || m.includes("unauthorized"))
    return "Você precisa fazer login pra essa ação.";
  if (m.includes("403") || m.includes("forbidden"))
    return "Você não tem permissão pra essa ação.";
  if (m.includes("404") || m.includes("not found"))
    return "O item solicitado não foi encontrado.";
  if (m.includes("400") || m.includes("bad request"))
    return "Algum dado enviado está em formato incorreto.";

  if (m.includes("notallowederror") && m.includes("media"))
    return "Permissão de microfone negada. Libere nas configurações do navegador.";
  if (m.includes("permission denied") && m.includes("media"))
    return "Permissão de microfone negada. Libere nas configurações do navegador.";
  if (m.includes("notfounderror") && m.includes("media"))
    return "Microfone não encontrado. Verifique se está conectado.";
  if (m.includes("popup") && (m.includes("block") || m.includes("closed")))
    return "Popup bloqueado pelo navegador. Libere popups e tente de novo.";

  if (m.includes("network") || m.includes("failed to fetch") || m.includes("networkerror"))
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  if (m.includes("aborted") || m.includes("timeout"))
    return "A operação demorou demais e foi cancelada. Tente novamente.";

  if (msg.length > 200) msg = msg.slice(0, 200) + "...";
  return msg || "Ocorreu um erro inesperado. Tente novamente.";
}