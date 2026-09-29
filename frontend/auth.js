/* SocioVerse auth pages | Abdul Basit */
const $ = s => document.querySelector(s), page = location.pathname.split('/').pop();
function finishLogin() {
  const target = sessionStorage.getItem('returnTo') || '';
  sessionStorage.removeItem('returnTo');
  location.href = /^\/(?:index\.html)?#\/(?:post|profile|chats)\/[a-f0-9]{24}$/i.test(target) ? target : 'index.html';
}
// Login stays available when an old token is expired or revoked.
function toast(m, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' error' : ''); t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 3200); }
async function post(url, body) { const r = await fetch('/api/auth' + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.message || 'Something went wrong'); return d; }
document.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.firstChild.className = 'fas fa-eye' + (i.type === 'text' ? '-slash' : ''); });
const PHONE = { PK: /^(\+92|0)?3\d{9}$/, IN: /^(\+91)?[6-9]\d{9}$/, US: /^(\+1)?\d{10}$/, GB: /^(\+44|0)7\d{9}$/, AE: /^(\+971|0)?5\d{8}$/, SA: /^(\+966|0)?5\d{8}$/ };
const token = new URLSearchParams(location.search).get('token');
if (page === 'reset.html') { $('#email').required = !token; $('#password').required = !!token; }
if (page === 'reset.html' && token) { $('#title').textContent = 'Reset Password'; $('#sub').textContent = 'Choose a new password.'; $('#emailBox').hidden = true; $('#passBox').hidden = false; $('#btn').textContent = 'Reset Password'; }
$('#f').onsubmit = async e => {
  e.preventDefault(); const err = $('#err'), btn = $('#btn'), v = id => $('#' + id)?.value.trim(); err.textContent = '';
  try {
    if (page === 'register.html') {
      const birth = new Date(v('dob')), today = new Date();
      const age = today.getUTCFullYear() - birth.getUTCFullYear() - (today.toISOString().slice(5, 10) < v('dob').slice(5, 10) ? 1 : 0);
      if (!Number.isFinite(age) || age < 18) throw new Error('You must be at least 18 years old');
      if ($('#password').value !== $('#confirm').value) throw new Error('Passwords do not match');
      if (v('phone') && PHONE[v('country')] && !PHONE[v('country')].test(v('phone'))) throw new Error('Invalid phone number for selected country');
    }
    btn.disabled = true; btn.innerHTML = '<span class="spin" style="width:16px;height:16px"></span>';
    if (page === 'register.html') {
      const d = await post('/register', { fullName: v('fullName'), username: v('username'), email: v('email'), phone: v('phone'), country: v('country'), gender: v('gender'), dob: v('dob'), password: $('#password').value });
      localStorage.removeItem('token'); sessionStorage.token = d.token; finishLogin();
    } else if (page === 'login.html') {
      const d = await post('/login', { identifier: v('identifier'), password: $('#password').value, remember: $('#remember').checked });
      localStorage.removeItem('token'); sessionStorage.removeItem('token'); ($('#remember').checked ? localStorage : sessionStorage).token = d.token; finishLogin();
    } else if (token) {
      const d = await post('/reset/' + encodeURIComponent(token), { password: $('#password').value }); localStorage.removeItem('token'); sessionStorage.removeItem('token'); toast(d.message); setTimeout(() => location.href = 'login.html', 1600);
    } else {
      const d = await post('/forgot', { email: v('email') }); toast(d.message);
      $('#prev').replaceChildren();
      if (d.preview && new URL(d.preview).origin === 'https://ethereal.email') { const link = document.createElement('a'); link.href = d.preview; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open email preview (Ethereal)'; $('#prev').append(link); }
    }
  } catch (x) { err.textContent = x.message; toast(x.message, true); }
  btn.disabled = false; btn.textContent = { 'register.html': 'Create Account', 'login.html': 'Login' }[page] || (token ? 'Reset Password' : 'Send Reset Link');
};
