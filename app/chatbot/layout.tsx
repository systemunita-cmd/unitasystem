"use client";
import AuthGuard from "../components/AuthGuard";
import { SoftphoneProvider } from "../hooks/useSoftphone";
import { Softphone } from "../components/Softphone";

// ═══════════════════════════════════════════════════════════════════════
// 🎧 Layout do Chatbot — envolve todas as páginas em /chatbot/*
// ═══════════════════════════════════════════════════════════════════════
// • 🔒 AuthGuard bloqueia acesso sem login (redireciona pra "/")
// • Provê o SoftphoneContext pra que o botão "📞 Ligar" no chat funcione
// • Renderiza o <Softphone /> flutuante no canto inferior direito
// ═══════════════════════════════════════════════════════════════════════

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SoftphoneProvider>
        {children}
        <Softphone />
      </SoftphoneProvider>
    </AuthGuard>
  );
}