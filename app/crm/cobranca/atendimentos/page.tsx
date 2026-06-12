"use client";
import { ChatSection } from "../../../chatbot/_sections/ChatSection";

// ═══════════════════════════════════════════════════════════════════════
// 💬 ATENDIMENTOS DA COBRANÇA — UnitaSystem
// ───────────────────────────────────────────────────────────────────────
// Reaproveita o MESMO ChatSection do Chatbot (zero duplicação: fluxos,
// conexões, etiquetas, áudio, respostas rápidas — tudo igual), só que em
// modo cobrança: a lista mostra apenas atendimentos cuja FILA contenha
// "COBRAN" ou cuja CONEXÃO WhatsApp tenha "cobran" no nome, e ao abrir a
// conversa aparece o painel 💰 com os dados do cliente (proposta + faturas).
// ═══════════════════════════════════════════════════════════════════════

export default function AtendimentosCobranca() {
  return <ChatSection modoCobranca />;
}