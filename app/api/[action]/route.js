import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';
import { sign, setCookie, clearCookie, getUserId, isAdmin } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

const TASKS = {
  1: { name: 'Download Kuda App', reward: 100 },
  2: { name: 'Create new email account', reward: 50 },
  3: { name: 'Create New PalmPay Account', reward: 250 },
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^(0|\+?234)[789][01]\d{8}$/;
const NAME = /^[A-Za-z][A-Za-z .'-]{2,}$/;
const COLS = 'id,name,email,phone,bank_name,account_number,account_name,balance,created_at';

const out = (o, s = 200) => NextResponse.json(o, { status: s });
const fail = (m, s = 400) => out({ ok: false, error: m }, s);
const pub = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, balance: u.balance, created_at: u.created_at,
  bank: u.bank_name || '', account: u.account_number || '', acname: u.account_name || '',
});
const msg = (e) => (e && e.message && e.message.startsWith('MSG:') ? e.message.slice(4) : 'Something went wrong. Please try again.');
const phoneNorm = (p) => String(p || '').replace(/\s/g, '').replace(/^\+?234/, '0');

async function startSession(u) {
  await setCookie('st_session', await sign({ role: 'user', uid: u.id }, '30d'), 60 * 60 * 24 * 30);
}

export async function GET(req, { params }) {
  const { action } = await params;
  if (action === 'palmpay') {
    if (!(await isAdmin())) return fail('Not allowed.', 401);
    const r = await getDb().from('palmpay_requests').select('id,name,phone,created_at,users(name,email,phone)').order('created_at', { ascending: false }).limit(200);
    return out({ ok: true, items: r.data || [] });
  }
  if (action !== 'me') return fail('Not found', 404);
  const uid = await getUserId();
  if (!uid) return fail('Please log in again.', 401);
  const db = getDb();
  const [u, s, w, t] = await Promise.all([
    db.from('users').select(COLS).eq('id', uid).maybeSingle(),
    db.from('submissions').select('id,task_no,task_name,task_code,status,reject_reason,reward,created_at,reviewed_at').eq('user_id', uid).order('created_at', { ascending: false }),
    db.from('withdrawals').select('id,amount,status,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
    db.from('transactions').select('type,amount,note,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(100),
  ]);
  if (!u.data) return fail('Please log in again.', 401);
  return out({ ok: true, user: pub(u.data), submissions: s.data || [], withdrawals: w.data || [], transactions: t.data || [] });
}

export async function POST(req, { params }) {
  const { action } = await params;
  const db = getDb();
  try {
    if (action === 'logout') { await clearCookie('st_session'); return out({ ok: true }); }

    if (action === 'register') {
      const b = await req.json().catch(() => ({}));
      const name = String(b.name || '').trim();
      const email = String(b.email || '').trim().toLowerCase();
      const phoneRaw = String(b.phone || '').replace(/\s/g, '');
      const pw = String(b.password || '').trim();
      if (name.length < 3 || !EMAIL.test(email) || !PHONE.test(phoneRaw) || pw.length < 8) return fail('Please check your details and try again.');
      const { data, error } = await db.from('users')
        .insert({ name, email, phone: phoneNorm(phoneRaw), password_hash: await bcrypt.hash(pw, 10) })
        .select(COLS).single();
      if (error) return error.code === '23505' ? fail('An account with this email or phone number already exists.', 409) : fail('Could not create your account. Please try again.', 500);
      await startSession(data);
      return out({ ok: true, user: pub(data) });
    }

    if (action === 'resetpw') {
      if (!(await isAdmin())) return fail('Not allowed.', 401);
      const b = await req.json().catch(() => ({}));
      const email = String(b.email || '').trim().toLowerCase();
      const pw = String(b.password || '').trim();
      if (!EMAIL.test(email) || pw.length < 8) return fail('Enter the email and a password of at least 8 characters.');
      const { data, error } = await db.from('users').update({ password_hash: await bcrypt.hash(pw, 10) }).eq('email', email).select('id');
      return error || !data || !data.length ? fail('No user with that email.', 404) : out({ ok: true });
    }

    if (action === 'login') {
      const b = await req.json().catch(() => ({}));
      const email = String(b.email || '').trim().toLowerCase();
      const { data: u } = await db.from('users').select(COLS + ',password_hash').eq('email', email).maybeSingle();
      const good = u && (await bcrypt.compare(String(b.password || ''), u.password_hash));
      if (!good) return fail('Incorrect email or password.', 401);
      await startSession(u);
      return out({ ok: true, user: pub(u) });
    }

    const uid = await getUserId();
    if (!uid) return fail('Please log in again.', 401);

    if (action === 'palmpay') {
      const b = await req.json().catch(() => ({}));
      const name = String(b.name || '').trim().slice(0, 80);
      const phone = String(b.phone || '').replace(/\s/g, '').slice(0, 20);
      if (!NAME.test(name) || !PHONE.test(phone)) return fail('Check the name and phone number.');
      const { error } = await db.from('palmpay_requests').insert({ user_id: uid, name, phone });
      return error ? fail('Could not save.', 500) : out({ ok: true });
    }

    if (action === 'payout') {
      const b = await req.json().catch(() => ({}));
      const bank = String(b.bank || '').trim().slice(0, 80);
      const account = String(b.account || '');
      const acname = String(b.acname || '').trim().slice(0, 80);
      if (!bank || !/^\d{10}$/.test(account) || !NAME.test(acname)) return fail('Check your bank details.');
      const { error } = await db.from('users').update({ bank_name: bank, account_number: account, account_name: acname.toUpperCase() }).eq('id', uid);
      return error ? fail('Could not save your bank details.', 500) : out({ ok: true });
    }

    if (action === 'profile') {
      const b = await req.json().catch(() => ({}));
      const name = String(b.name || '').trim();
      const email = String(b.email || '').trim().toLowerCase();
      if (name.length < 3 || !EMAIL.test(email)) return fail('Check your name and email.');
      const { error } = await db.from('users').update({ name, email }).eq('id', uid);
      if (error) return error.code === '23505' ? fail('That email is already used by another account.', 409) : fail('Could not save changes.', 500);
      return out({ ok: true });
    }

    if (action === 'password') {
      const b = await req.json().catch(() => ({}));
      const next = String(b.next || '').trim();
      if (next.length < 8) return fail('Use at least 8 characters.');
      const { data: u } = await db.from('users').select('password_hash').eq('id', uid).maybeSingle();
      if (!u || !(await bcrypt.compare(String(b.current || ''), u.password_hash))) return fail('Your current password is wrong.', 401);
      await db.from('users').update({ password_hash: await bcrypt.hash(next, 10) }).eq('id', uid);
      return out({ ok: true });
    }

    if (action === 'withdraw') {
      const b = await req.json().catch(() => ({}));
      const amount = Math.floor(Number(b.amount));
      if (!Number.isFinite(amount) || amount < 100) return fail('The minimum withdrawal is 100 naira.');
      const { error } = await db.rpc('request_withdrawal', { p_user: uid, p_amount: amount });
      return error ? fail(msg(error)) : out({ ok: true });
    }

    if (action === 'submit') {
      const fd = await req.formData();
      const taskNo = Number(fd.get('taskNo'));
      const task = TASKS[taskNo];
      const code = String(fd.get('taskId') || '').trim();
      const file = fd.get('screenshot');
      if (!task) return fail('Unknown task. Start the task again.');
      if (!/^[A-Za-z0-9-]{6,40}$/.test(code)) return fail('Enter a valid Task ID.');
      if (!file || typeof file === 'string' || !String(file.type).startsWith('image/')) return fail('Upload a screenshot image.');
      if (file.size > 4 * 1024 * 1024) return fail('The screenshot is too large. Use one under 4 MB.');

      let extra = null;
      if (taskNo === 3) {
        try {
          const x = JSON.parse(String(fd.get('extra') || '{}'));
          extra = { name: String(x.name || '').slice(0, 80), phone: String(x.phone || '').slice(0, 20) };
        } catch { extra = null; }
      }

      const path = `${uid}/${Date.now()}-${taskNo}.jpg`;
      const up = await db.storage.from('screenshots').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
      if (up.error) return fail('Could not upload the screenshot. Please try again.', 500);

      const { error } = await db.from('submissions').insert({
        user_id: uid, task_no: taskNo, task_name: task.name, task_code: code,
        reward: task.reward, screenshot_path: path, extra,
      });
      if (error) {
        await db.storage.from('screenshots').remove([path]);
        return error.code === '23505' ? fail('You already submitted this task, or this Task ID was already used.', 409) : fail('Could not save your submission.', 500);
      }
      return out({ ok: true });
    }
  } catch (e) {
    console.error(e);
    return fail('Something went wrong. Please try again.', 500);
  }
  return fail('Not found', 404);
}