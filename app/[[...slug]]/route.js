import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

const routes = new Set(['/', '/register', '/payout', '/login', '/dashboard', '/dashboard/submissions', '/dashboard/wallet', '/dashboard/inbox', '/dashboard/profile', '/terms', '/privacy', '/support']);

export async function GET(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  const infoPaths = {'/about':'about','/faq':'faq','/support':'support','/contact':'contact','/privacy':'privacy','/terms':'terms','/policy':'policy'};
  if (infoPaths[path]) return Response.redirect(new URL('/#/p/' + infoPaths[path], request.url), 302);
  if (!routes.has(path)) return new Response('Page not found', { status: 404 });
  let html = await readFile(join(process.cwd(), 'original', 'selar-landing.html'), 'utf8');
  // links to the info pages (must run before the href="#" -> /login rule below)
  html = html
    .replace('<a href="#about">About Us</a><a href="#faq">FAQ</a>', '<a href="/#/p/about">About Us</a><a href="/#/p/faq">FAQ</a>')
    .replace('<a href="#">Support Center</a><a href="#">Contact Us</a><a href="#">Delete Account</a>', '<a href="/#/p/support">Support Center</a><a href="/#/p/contact">Contact Us</a><a href="mailto:supportstl@yahoo.com?subject=Account%20Deletion%20Request">Delete Account</a>')
    .replace('<a href="#">Privacy Policy</a><a href="#">Terms of Use</a><a href="#">User Policy</a>', '<a href="/#/p/privacy">Privacy Policy</a><a href="/#/p/terms">Terms of Use</a><a href="/#/p/policy">User Policy</a>')
    .replace('<a class="btn btn-line btn-lg" href="#">Contact support</a>', '<a class="btn btn-line btn-lg" href="/#/p/contact">Contact support</a>')
    .replace('you agree to our <a href="#">Terms</a> &amp; <a href="#">Privacy Policy</a>.', 'you agree to our <a href="/#/p/terms">Terms</a> &amp; <a href="/#/p/privacy">Privacy Policy</a>.');
  // add the info pages from their own file (skipped if you pasted them into selar-landing.html)
  if (!html.includes('id="info"')) {
    try {
      const info = await readFile(join(process.cwd(), 'original', 'info-pages.html'), 'utf8');
      html = html.replace('</body>', () => info + '</body>');
    } catch {}
  }
  // Preserve all original markup, CSS, wording and visuals; adapt only navigation.
  html = html.replaceAll('href="#/register"', 'href="/register"')
    .replaceAll('href="#/payout"', 'href="/payout"')
    .replaceAll('href="#/dashboard"', 'href="/dashboard"');
  html = html.replace(/function route\(\)\{.*?window\.scrollTo\(0,0\);\}/s,
    `function route(){var h=location.pathname,r=h==='/register',p=h==='/payout',d=h.startsWith('/dashboard'),login=h==='/login';reg.hidden=!(r||login);pay.hidden=!p;dash.hidden=!d;home.hidden=r||p||d||login;document.title=r?'Create your account – SureTask':p?'Set up payout details – SureTask':d?'Dashboard – SureTask':homeTitle;window.scrollTo(0,0);}`);
  html = html.replace("window.addEventListener('hashchange',route);route();", 'route();');
  html = html.replace("location.hash='#/payout'", "location.href='/payout'")
    .replace("location.hash='#/dashboard'", "location.href='/dashboard'")
    .replace("location.hash!=='#/payout'", "location.pathname!=='/payout'")
    .replace("location.hash==='#/dashboard'", "location.pathname.startsWith('/dashboard')");
  html = html.replaceAll('href="#top"', 'href="/"');
  html = html.replaceAll('href="#"', 'href="/login"');
  // Connect existing dashboard sidebar items to their dedicated routes.
  const navPaths = ['/dashboard','/dashboard/submissions','/dashboard/wallet','/dashboard/inbox','/dashboard/profile'];
  let navIndex = 0;
  html = html.replace(/(<a href="\/dashboard"(?: aria-current="page")?>)(Explore Jobs|My Submissions|Wallet|Inbox|Profile)(<\/a>)/g, (_m,_open,label,close) => {
    const url = navPaths[navIndex++];
    return `<a href="${url}"${path === url ? ' aria-current="page"' : ''}>${label}${close}`;
  });
  // Only the original Explore Tasks panel has implemented content.
  if (path.startsWith('/dashboard/') && path !== '/dashboard') {
    const title = {'/dashboard/submissions':'My Submissions','/dashboard/wallet':'Wallet','/dashboard/inbox':'Inbox','/dashboard/profile':'Profile'}[path];
    html = html.replace('<h1 class="atitle">Explore Tasks</h1>', `<h1 class="atitle">${title}</h1>`);
    html = html.replace('<form class="filters" id="filt">', '<form class="filters" id="filt" hidden>');
    html = html.replace('<div class="cards" id="cards"></div>', '<div class="cards" id="cards" hidden></div>');
    html = html.replace('<div class="pager" id="pager"></div>', '<div class="pager" id="pager" hidden></div>');
    html = html.replace('<div class="soon" id="soon" hidden>', '<div class="soon" id="soon" hidden>');
  }
  // These original screens do not exist in the uploaded HTML; do not fabricate them.
  if (['/terms','/privacy','/support'].includes(path)) {
    const label = {'/terms':'Terms of Use','/privacy':'Privacy Policy','/support':'Support'}[path];
    html = html.replace('<main id="top">', `<main id="top"><section class="wrap"><h1 class="sec-title">${label}</h1><p class="sec-sub">Content to be provided.</p></section><div hidden>`);
    html = html.replace('</main>', '</div></main>');
  }
  // Keep the existing HTML exactly otherwise, including original placeholder content.
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
