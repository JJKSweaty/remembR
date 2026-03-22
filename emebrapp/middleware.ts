import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/", "/meds", "/chat", "/find", "/settings", "/auth/onboarding"];
const PUBLIC    = ["/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = PROTECTED.some((p) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p)
  );
  const isPublicAuth = PUBLIC.some((p) => pathname.startsWith(p));

  // Not logged in → send to /auth
  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  // Logged in → don't let them hit /auth (unless it's /auth/onboarding)
  if (user && isPublicAuth && !pathname.startsWith("/auth/onboarding")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
