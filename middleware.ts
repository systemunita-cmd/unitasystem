import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Subdomínio app.* na raiz "/" → vai pra página /redirect que decide
  // (logado vai pra /crm, deslogado vai pra /login).
  // A checagem real de sessão acontece no client (localStorage do Supabase).
  if (host.startsWith("app.") && pathname === "/") {
    return NextResponse.rewrite(new URL("/redirect", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.*|.*\\.png).*)"],
};