import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === '/login';
  const isPublicMagicLink = pathname.startsWith('/api/logistics/public/') || pathname.startsWith('/logistics/quote/');

  if (isLogin || isPublicMagicLink) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('your-project')) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'AUTH_NOT_CONFIGURED' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/login?error=AUTH_NOT_CONFIGURED', request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set(name, value);
        response.cookies.set(name, value, options);
      }),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
    }
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|html|txt|xml|pdf)$).*)'],
};
