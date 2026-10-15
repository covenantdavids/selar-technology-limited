import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/db';
import { sign, setCookie, clearCookie, isAdmin, safeEqual } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

const out = (o, s = 200) => NextResponse.json(o, { status: s });
const fail = (m, s = 400) => out({ ok: false, error: m }, s);
const msg = (e) => (e && e.message && e.message.startsWith('MSG:') ? e.message.slice(4) : 'Something went wrong.');

export async function GET(req, { params }) {
  const { action } = await params;
  if (action !== 'data') return fail('Not found', 404);
  if (!(await isAdmin())) return fail('Not logged in', 401);
  const db = getDb();

  // start of today in Nigeria time (UTC+1)
  const lag = new Date(Date.now() + 3600e3); lag.setUTCHours(0, 0, 0, 0);
  const since = new Date(lag.getTime() - 3600e3).toISOString();

  const [users, subs, recent, wds, recentW, appr, paid] = await Promise.all([
    db.from('users').select('id,name,email,phone,bank_name,account_number,account_name,balance,created_at').order('created_at', { ascending: false }).limit(500),
    db.from('submissions').select('id,task_no,task_name,task_code,reward,screenshot_path,extra,created_at,users(name,email,phone)').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    db.from('submissions').select('id,task_name,reward,status,reject_reason,reviewed_at,users(name)').neq('status', 'pending').order('reviewed_at', { ascending: false }).limit(30),
    db.from('withdrawals').select('id,amount,bank_name,account_number,account_name,created_at,users(name)').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    db.from('withdrawals').select('id,amount,status,done_at,account_name,users(name)').neq('status', 'pending').order('done_at', { ascending: false }).limit(30),
    db.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('reviewed_at', since),
    db.from('withdrawals').select('amount').eq('status', 'paid').gte('done_at', since),
  ]);
  if (users.error || subs.error || wds.error) return fail('Could not load data.', 500);

  const urls = await Promise.all(subs.data.map((s) => db.storage.from('screenshots').createSignedUrl(s.screenshot_path, 3600)));
  const subsOut = subs.data.map((s, i) => ({ ...s, screenshot_path: undefined, screenshot_url: urls[i].data ? urls[i].data.signedUrl : null }));

  return out({
    ok: true,
    stats: {
      users: users.data.length, subs: subs.data.length, wds: wds.data.length,
      approvedToday: appr.count || 0,
      paidToday: (paid.data || []).reduce((a, w) => a + w.amount, 0),
    },
    users: users.data, subs: subsOut, recentSubs: recent.data || [], wds: wds.data, recentWds: recentW.data || [],
  });
}

export async function POST(req, { params }) {
  const { action } = await params;
  const b = await req.json().catch(() => ({}));

  if (action === 'login') {
    const okE = safeEqual(String(b.email || '').trim().toLowerCase(), String(process.env.ADMIN_EMAIL || '').toLowerCase());
    const okP = safeEqual(String(b.password || ''), String(process.env.ADMIN_PASSWORD || ''));
    if (!okE || !okP || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
      await new Promise((r) => setTimeout(r, 1000));
      return fail('Wrong email or password.', 401);
    }
    await setCookie('st_admin', await sign({ role: 'admin' }, '12h'), 60 * 60 * 12);
    return out({ ok: true });
  }
  if (action === 'logout') { await clearCookie('st_admin'); return out({ ok: true }); }

  if (!(await isAdmin())) return fail('Not logged in', 401);
  if (action !== 'act') return fail('Not found', 404);
  const db = getDb();
  const id = String(b.id || '');

  if (b.type === 'approve') {
    const { error } = await db.rpc('approve_submission', { p_id: id });
    return error ? fail(msg(error)) : out({ ok: true });
  }
  if (b.type === 'reject') {
    const reason = String(b.reason || '').trim().slice(0, 200);
    if (!reason) return fail('Choose a reject reason first.');
    const { data, error } = await db.from('submissions')
      .update({ status: 'rejected', reject_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending').select('id');
    return error || !data || !data.length ? fail('This submission is not pending.') : out({ ok: true });
  }
  if (b.type === 'paid' || b.type === 'wreject') {
    const { error } = await db.rpc('withdrawal_action', { p_id: id, p_action: b.type === 'paid' ? 'paid' : 'reject' });
    return error ? fail(msg(error)) : out({ ok: true });
  }
  return fail('Unknown action.');
}
