import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SoftphoneProvider } from "./hooks/useSoftphone";
import { Softphone } from "./components/Softphone";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grupo Unita",
  description: "Sistema de Atendimento e CRM — Grupo Unita",
  icons: {
    icon: "/logo1.png",
    apple: "/logo1.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* SoftphoneProvider envolve TUDO — permite que qualquer página/componente
            (CRM, Chatbot, etc) chame useSoftphone() sem precisar de Provider local.
            O <Softphone /> renderiza uma bolha flutuante no canto inferior direito,
            visível em todas as rotas (mas só é funcional pra usuário autenticado). */}
        <SoftphoneProvider>
          {children}
          <Softphone />
        </SoftphoneProvider>
      </body>
    </html>
  );
}