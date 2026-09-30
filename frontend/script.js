/* SocioVerse - main app | Abdul Basit */
const $ = (s, r = document) => r.querySelector(s), token = localStorage.token || sessionStorage.token;
if (!token) { sessionStorage.setItem('returnTo', location.pathname + location.hash); location.replace('login.html'); }
let me, socket, online = new Set(), unreadMsgs = 0, openChat = null, typingTimer;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mediaURL = value => typeof value === 'string' && /^data:(?:image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm|ogg));base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (r.status === 401) { sessionStorage.setItem('returnTo', location.pathname + location.hash); logout(); throw new Error('Please log in again'); }
  if (!r.ok) { toast(d.message || 'Request failed', true); throw new Error(d.message); } return d;
}
function toast(m, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' error' : ''); t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 3000); }
function logout() { localStorage.removeItem('token'); sessionStorage.removeItem('token'); location.href = 'login.html'; }
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? ~~(s / 60) + 'm ago' : s < 86400 ? ~~(s / 3600) + 'h ago' : new Date(d).toLocaleDateString(); };
const av = (u, c = '') => mediaURL(u?.avatar) ? `<img class="av ${c}" src="${mediaURL(u.avatar)}" alt="">` : `<div class="av ${c}">${esc((u?.fullName || '?')[0]).toUpperCase()}</div>`;
const spinner = '<div class="center"><span class="spin"></span></div>';
const readFile = (f, maxMB = 3) => new Promise((ok, no) => { if (!f) return no(new Error('Choose a file')); if (!/^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|ogg))$/.test(f.type) || f.size > maxMB * 1e6) { const error = new Error('Choose a supported image or video (max ' + maxMB + 'MB)'); toast(error.message, true); return no(error); } const r = new FileReader(); r.onload = () => ok({ data: r.result, type: f.type.startsWith('video') ? 'video' : 'image' }); r.onerror = () => no(new Error('Could not read file')); r.readAsDataURL(f); });
function modal(html) { const o = document.createElement('div'); o.className = 'overlay'; o.innerHTML = `<div class="modal">${html}</div>`; o.onclick = e => { if (e.target === o) o.remove(); }; $('#modalRoot').append(o); return o; }
const closeModal = () => document.querySelectorAll('.overlay').forEach(o => o.remove());

/* ---------- boot ---------- */
(async function init() {
  if (!token) return;
  me = await api('/users/me');
  $('#nav').innerHTML = `<a href="#/feed" data-r="feed"><i class="fas fa-home"></i>Feed</a><a href="#/profile/${me._id}" data-r="profile"><i class="fas fa-user"></i>Profile</a><a href="#/chats" data-r="chats"><i class="fas fa-comments"></i>Chats</a><a href="#/friends" data-r="friends"><i class="fas fa-user-friends"></i>Friends <span class="badge" id="frBadge" data-n="0" style="position:static"></span></a>
  <button data-act="blockedList"><i class="fas fa-ban"></i>Blocked</button><button data-act="changePass"><i class="fas fa-key"></i>Password</button><button data-act="logout"><i class="fas fa-sign-out-alt"></i>Logout</button>`;
  socket = io({ auth: { token }, transports: ['websocket'] });
  socket.on('online:list', l => online = new Set(l)); socket.on('presence', p => { p.online ? online.add(p.id) : online.delete(p.id); if (location.hash.startsWith('#/chats')) updatePresence(); });
  socket.on('notification', n => { toast(notifText(n)); loadNotifs(); });
  socket.on('friend:update', () => { refreshFriendBadge(); if (location.hash === '#/friends') route(); });
  socket.on('message', onMessage); socket.on('typing', ({ from, typing }) => { if (openChat === from && $('#typing')) $('#typing').textContent = typing ? 'typing...' : ''; });
  loadNotifs(); refreshFriendBadge(); refreshUnread(); route();
})().catch(error => { $('#view').innerHTML = `<div class="card empty">${esc(error.message || 'Unable to connect. Please reload.')}</div>`; });
window.addEventListener('hashchange', route);
async function route() {
  if (!me) return;
  if (openChat) socket?.emit('typing', { to: openChat, typing: false });
  clearTimeout(typingTimer); openChat = null;
  clearTimeout(sv.timer); $('#sviewer')?.remove();
  const [, r, id] = location.hash.split('/'); document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (r || 'feed')));
  $('#sidebar').classList.remove('open'); $('#view').innerHTML = spinner;
  if (r === 'post') { try { const p = await api('/posts/' + id); $('#view').innerHTML = postHTML(p); } catch { $('#view').innerHTML = '<div class="card empty">Post unavailable.</div>'; } }
  else if (r === 'profile') await profileView(id || me._id); else if (r === 'chats') await chatsView(id); else if (r === 'friends') await friendsView(); else await feedView();
  if (r !== 'chats') suggestions(); else $('#right').innerHTML = '';
}
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');

/* ---------- feed & stories ---------- */
async function feedView() {
  const viewHash = location.hash;
  $('#view').innerHTML = `<div class="card"><div class="stories" id="stories"></div></div>
  <div class="card composer"><div class="person">${av(me)}<b>What's on your mind, ${esc(me.fullName.split(' ')[0])}?</b></div><textarea id="ptext" placeholder="Share something..."></textarea><div id="ppreview"></div>
  <div class="bar"><label class="btn ghost sm"><i class="fas fa-image"></i> Photo/Video<input type="file" id="pfile" accept="image/*,video/*" hidden></label><select id="ppriv"><option value="public">Everyone</option><option value="me">Only Me</option></select><div class="grow"></div><button class="btn" id="pbtn">Post</button></div></div><div id="posts">${spinner}</div>`;
  let media = null;
  $('#pfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { media = await readFile(f); $('#ppreview').innerHTML = `<div class="preview">${media.type === 'video' ? `<video src="${media.data}" controls></video>` : `<img src="${media.data}">`}<button class="btn danger sm" id="rmMedia">Remove</button></div>`; $('#rmMedia').onclick = () => { media = null; $('#ppreview').innerHTML = ''; $('#pfile').value = ''; }; } catch {} };
  $('#pbtn').onclick = async () => {
    const b = $('#pbtn'); b.disabled = true;
    try { const p = await api('/posts', 'POST', { text: $('#ptext').value, media: media?.data, mediaType: media?.type, privacy: $('#ppriv').value }); $('#posts .empty')?.remove(); $('#posts').insertAdjacentHTML('afterbegin', postHTML(p)); $('#ptext').value = ''; media = null; $('#ppreview').innerHTML = ''; toast('Post published'); } catch {}
    b.disabled = false;
  };
  loadStories(); const posts = await api('/posts/feed'); if (location.hash !== viewHash || !$('#posts')) return; $('#posts').innerHTML = posts.map(postHTML).join('') || '<div class="empty card">No posts yet. Add friends or create the first post!</div>';
}
let storyGroups = [];
async function loadStories(target = '#stories', uid) {
  const viewHash = location.hash, groups = await api(uid ? '/stories/user/' + uid : '/stories'); const box = $(target); if (!box || location.hash !== viewHash) return; storyGroups = groups;
  const mine = storyGroups.find(g => g.user._id === me._id);
  box.innerHTML = (!uid || uid === me._id ? `<button class="story" data-act="addStory"><div class="add"><i class="fas fa-plus"></i></div>Your story<input type="file" id="sfile" accept="image/*,video/*" hidden></button>` : '') +
    storyGroups.map((g, i) => `<button class="story" data-act="viewStory" data-i="${i}"><div class="ring ${g.stories.every(s => s.seen) && g.user._id !== me._id ? 'seen' : ''}">${av(g.user)}</div>${g.user._id === me._id ? 'You' : esc(g.user.fullName.split(' ')[0])}</button>`).join('');
  const f = $('#sfile'); if (f) f.onchange = async e => { const file = e.target.files[0]; if (!file) return; try { const m = await readFile(file); await api('/stories', 'POST', { media: m.data, mediaType: m.type }); toast('Story added (visible for 24 hours)'); loadStories(target, uid); } catch {} };
}
function postHTML(p) {
  const mine = p.user._id === me._id, ic = { public: 'globe', friends: 'user-friends', me: 'lock' }[p.privacy];
  return `<article class="card post" id="p-${p._id}"><div class="post-head"><a href="#/profile/${p.user._id}">${av(p.user)}</a><div class="info"><a href="#/profile/${p.user._id}"><b>${esc(p.user.fullName)}</b></a><small>@${esc(p.user.username)} · ${ago(p.createdAt)} · <i class="fas fa-${ic}"></i></small></div>${mine ? `<button class="icon-x" data-act="delPost" data-id="${p._id}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}</div>
  ${p.text ? `<p>${esc(p.text)}</p>` : ''}${p.media ? (p.mediaType === 'video' ? `<video class="media" src="${mediaURL(p.media)}" controls></video>` : `<img class="media" src="${mediaURL(p.media)}" loading="lazy">`) : ''}
  <div class="actions"><button data-act="like" data-id="${p._id}" class="${p.liked ? 'liked' : ''}"><i class="${p.liked ? 'fas' : 'far'} fa-heart"></i> <span>${p.likesCount}</span></button><button data-act="comments" data-id="${p._id}"><i class="far fa-comment"></i> <span>${p.commentsCount}</span></button><button data-act="share" data-id="${p._id}"><i class="fas fa-share"></i> Share</button></div><div class="comments" id="c-${p._id}" hidden></div></article>`;
}
const commentHTML = (c, postOwner) => `<div class="comment" id="cm-${c._id}">${av(c.user, 'sm')}<div class="bubble"><b>${esc(c.user.fullName)}</b> <small style="color:var(--mut)">${ago(c.createdAt)}</small><div>${esc(c.text)}</div></div>${c.user._id === me._id || postOwner ? `<button class="icon-x" data-act="delComment" data-id="${c._id}" data-p="${c.post}"><i class="fas fa-times"></i></button>` : ''}</div>`;

/* ---------- story viewer ---------- */
let sv = { gi: 0, si: 0, timer: null };
function openStory(gi, si = 0) {
  clearTimeout(sv.timer); const g = storyGroups[gi]; if (!g) return closeStory(); if (si >= g.stories.length) return openStory(gi + 1); if (si < 0) return gi > 0 ? openStory(gi - 1, storyGroups[gi - 1].stories.length - 1) : closeStory();
  sv = { gi, si }; const s = g.stories[si], own = g.user._id === me._id; closeStory(true); api(`/stories/${s._id}/view`, 'POST').catch(() => {});
  const o = document.createElement('div'); o.className = 'overlay viewer'; o.id = 'sviewer';
  o.innerHTML = `<div class="sv-wrap"><div class="sv-bars">${g.stories.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('')}</div><div class="sv-top">${av(g.user, 'sm')}<b>${esc(g.user.fullName)}</b><small>${ago(s.createdAt)}</small><div class="grow"></div><button class="icon-x" data-act="closeStory" style="color:#fff"><i class="fas fa-times"></i></button></div>
  <button class="nav-arrow" style="left:8px" data-act="svPrev"><i class="fas fa-chevron-left"></i></button><button class="nav-arrow" style="right:8px" data-act="svNext"><i class="fas fa-chevron-right"></i></button>
  ${s.mediaType === 'video' ? `<video src="${mediaURL(s.media)}" autoplay playsinline id="svVid"></video>` : `<img src="${mediaURL(s.media)}">`}
  <div class="sv-bot">${own ? `<button class="btn sm ghost" data-act="svDetails" data-id="${s._id}"><i class="fas fa-eye"></i> Views</button><button class="btn sm danger" data-act="svDelete" data-id="${s._id}"><i class="fas fa-trash"></i></button>` : `<button class="btn sm ${s.liked ? '' : 'ghost'}" data-act="svLike" data-id="${s._id}"><i class="fas fa-heart"></i> ${s.liked ? 'Liked' : 'Like'}</button>`}</div></div>`;
  document.body.append(o); const bar = $('.sv-bars i:nth-child(' + (si + 1) + ') b', o), vid = $('#svVid');
  const run = ms => { bar.style.transition = `width ${ms}ms linear`; requestAnimationFrame(() => requestAnimationFrame(() => bar.style.width = '100%')); sv.timer = setTimeout(() => openStory(gi, si + 1), ms); };
  if (vid) { vid.onloadedmetadata = () => run(vid.duration * 1000); vid.onerror = () => run(4000); } else run(5000);
}
function closeStory(keep) { clearTimeout(sv.timer); $('#sviewer')?.remove(); if (!keep) loadStories(); }

/* ---------- profile ---------- */
async function profileView(id) {
  const viewHash = location.hash;
  let u; try { u = await api('/users/' + id); } catch { return $('#view').innerHTML = '<div class="card empty">This profile is not available.</div>'; }
  if (location.hash !== viewHash) return;
  const self = u.status === 'self';
  $('#view').innerHTML = `<div class="card" style="padding:0"><div class="cover" style="${u.cover ? `background-image:url(${mediaURL(u.cover)})` : ''}"></div><div class="pinfo">${av(u, 'lg')}<div class="txt"><h2>${esc(u.fullName)}</h2><small style="color:var(--mut)">@${esc(u.username)} ${u.isPrivate ? '<i class="fas fa-lock"></i> Private' : '<i class="fas fa-globe"></i> Public'}</small><p style="font-size:.85rem;margin-top:6px">${esc(u.bio)}</p>${u.location ? `<small style="color:var(--mut)"><i class="fas fa-map-marker-alt"></i> ${esc(u.location)}</small>` : ''}</div>
  <div class="pact">${self ? `<button class="btn" data-act="editProfile"><i class="fas fa-edit"></i> Edit Profile</button>` : friendBtn(u) + `<button class="btn ghost" data-act="openChat" data-id="${u._id}"><i class="fas fa-comment"></i> Message</button><button class="btn danger" data-act="block" data-id="${u._id}"><i class="fas fa-ban"></i></button>`}</div></div>
  <div class="stats" style="padding:0 22px 18px"><div><b>${u.postsCount}</b>Posts</div><div><b>${u.friendsCount}</b>Friends</div></div></div>
  ${u.visible ? `<div class="card"><div class="stories" id="pstories"></div></div><div id="posts">${spinner}</div>` : `<div class="card private-note"><i class="fas fa-lock"></i>This account is private.<br>Send a friend request to see posts and stories.</div>`}`;
  if (!u.visible) return; loadStories('#pstories', u._id);
  const posts = await api('/posts/user/' + u._id); if (location.hash !== viewHash || !$('#posts')) return; $('#posts').innerHTML = posts.map(postHTML).join('') || '<div class="empty card">No posts yet.</div>';
}
const friendBtn = u => ({ none: `<button class="btn" data-act="frSend" data-id="${u._id}"><i class="fas fa-user-plus"></i> Add Friend</button>`, sent: `<button class="btn ghost" data-act="frCancel" data-id="${u._id}">Cancel Request</button>`,
  received: `<button class="btn" data-act="frAccept" data-id="${u._id}">Accept</button><button class="btn ghost" data-act="frReject" data-id="${u._id}">Reject</button>`, friends: `<button class="btn ghost" data-act="frRemove" data-id="${u._id}"><i class="fas fa-user-check"></i> Friends</button>` }[u.status] || '');
function editProfile() {
  let av_ = me.avatar, cv = me.cover; const o = modal(`<h3>Edit Profile</h3><div class="fg"><label>Full name</label><input id="e-name" value="${esc(me.fullName)}"></div><div class="fg"><label>Bio</label><textarea id="e-bio" maxlength="200">${esc(me.bio)}</textarea></div><div class="fg"><label>Location</label><input id="e-loc" value="${esc(me.location)}"></div>
  <div class="fg"><label>Profile picture</label><input type="file" id="e-av" accept="image/*"> <button class="btn sm ghost" id="e-avx" type="button">Remove</button></div><div class="fg"><label>Cover photo</label><input type="file" id="e-cv" accept="image/*"> <button class="btn sm ghost" id="e-cvx" type="button">Remove</button></div>
  <div class="fg"><label>Account privacy</label><select id="e-priv"><option value="0">Public</option><option value="1" ${me.isPrivate ? 'selected' : ''}>Private (friends only)</option></select></div><div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="e-save">Save</button></div>`);
  $('#e-av', o).onchange = async e => { try { av_ = (await readFile(e.target.files[0], 1.5)).data; } catch {} }; $('#e-cv', o).onchange = async e => { try { cv = (await readFile(e.target.files[0], 1.5)).data; } catch {} };
  $('#e-avx', o).onclick = () => { av_ = ''; toast('Picture will be removed on save'); }; $('#e-cvx', o).onclick = () => { cv = ''; toast('Cover will be removed on save'); };
  $('#e-save', o).onclick = async () => { await api('/users/me', 'PUT', { fullName: $('#e-name', o).value, bio: $('#e-bio', o).value, location: $('#e-loc', o).value, avatar: av_, cover: cv, isPrivate: $('#e-priv', o).value === '1' }); me = await api('/users/me'); closeModal(); toast('Profile updated'); route(); };
}
function changePass() {
  const o = modal(`<h3>Change Password</h3><div class="fg"><label>Current password</label><input type="password" id="cp1"></div><div class="fg"><label>New password</label><input type="password" id="cp2"></div><div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="cp-go">Update</button></div>`);
  $('#cp-go', o).onclick = async () => { const d = await api('/auth/change-password', 'POST', { current: $('#cp1', o).value, password: $('#cp2', o).value }); toast(d.message); logout(); };
}
async function blockedList() {
  const l = await api('/users/blocked'); modal(`<h3>Blocked Users</h3>${l.map(u => `<div class="person">${av(u, 'sm')}<div class="info"><b>${esc(u.fullName)}</b><small>@${esc(u.username)}</small></div><button class="btn sm ghost" data-act="unblock" data-id="${u._id}">Unblock</button></div>`).join('') || '<div class="empty">No blocked users</div>'}<div class="foot"><button class="btn ghost" data-act="closeModal">Close</button></div>`);
}

/* ---------- friends ---------- */
async function friendsView() {
  const [reqs, friends] = await Promise.all([api('/friends/requests'), api('/friends')]);
  $('#view').innerHTML = `<div class="card"><div class="hd">Friend Requests (${reqs.length})</div>${reqs.map(r => `<div class="person"><a href="#/profile/${r.from._id}">${av(r.from)}</a><div class="info"><b>${esc(r.from.fullName)}</b><small>@${esc(r.from.username)}</small></div><button class="btn sm" data-act="frAccept" data-id="${r.from._id}">Accept</button><button class="btn sm ghost" data-act="frReject" data-id="${r.from._id}">Reject</button></div>`).join('') || '<div class="empty">No pending requests</div>'}</div>
  <div class="card"><div class="hd">My Friends (${friends.length})</div>${friends.map(f => `<div class="person"><a href="#/profile/${f._id}">${av(f)}</a><div class="info"><b>${esc(f.fullName)}</b><small>@${esc(f.username)}</small></div><button class="btn sm ghost" data-act="openChat" data-id="${f._id}"><i class="fas fa-comment"></i></button><button class="btn sm danger" data-act="frRemove" data-id="${f._id}">Remove</button></div>`).join('') || '<div class="empty">No friends yet</div>'}</div>`;
}
const refreshFriendBadge = async () => { const r = await api('/friends/requests'); const b = $('#frBadge'); if (b) { b.textContent = r.length || ''; b.dataset.n = r.length; } };
async function suggestions() {
  const l = await api('/users/suggestions'); $('#right').innerHTML = `<div class="card"><div class="hd">People You May Know</div>${l.map(u => `<div class="person"><a href="#/profile/${u._id}">${av(u, 'sm')}</a><div class="info"><b>${esc(u.fullName)}</b><small>@${esc(u.username)}</small></div>${u.status === 'sent' ? `<button class="btn sm ghost" data-act="frCancel" data-id="${u._id}">Sent</button>` : u.status === 'received' ? `<button class="btn sm" data-act="frAccept" data-id="${u._id}">Accept</button>` : `<button class="btn sm" data-act="frSend" data-id="${u._id}"><i class="fas fa-user-plus"></i></button>`}</div>`).join('') || '<div class="empty">No suggestions</div>'}</div>`;
}

/* ---------- chat ---------- */
async function chatsView(uid) {
  const viewHash = location.hash, list = await api('/chats'); if (location.hash !== viewHash) return; openChat = uid || null;
  $('#view').innerHTML = `<div class="card chat ${uid ? 'open' : ''}"><div class="clist">${list.map(c => `<div class="citem ${c.user._id === uid ? 'on' : ''}" data-act="openChat" data-id="${c.user._id}"><div class="avwrap">${av(c.user)}${online.has(c.user._id) ? '<span class="dot"></span>' : ''}</div><div class="info"><b style="font-size:.86rem">${esc(c.user.fullName)}</b><small>${c.last.sender === me._id ? 'You: ' : ''}${esc(c.last.text)}</small></div>${c.unread ? `<span class="badge" style="position:static">${c.unread}</span>` : ''}</div>`).join('') || '<div class="empty">No conversations yet.<br>Open a profile and press Message.</div>'}</div>
  <div class="cbox">${uid ? '<div class="chead" id="chead"></div><div class="msgs" id="msgs"></div><div class="typing" id="typing"></div><form class="mform" id="mform"><input id="mtext" placeholder="Type a message..." autocomplete="off"><button class="btn"><i class="fas fa-paper-plane"></i></button></form>' : '<div class="empty" style="margin:auto">Select a chat to start messaging</div>'}</div></div>`;
  if (!uid) return; const u = await api('/users/' + uid).catch(() => null); if (!u || location.hash !== viewHash) return;
  $('#chead').innerHTML = `<button class="icon-x" onclick="location.hash='#/chats'" style="display:${innerWidth < 720 ? 'block' : 'none'}"><i class="fas fa-arrow-left"></i></button><div class="avwrap"><a href="#/profile/${uid}">${av(u, 'sm')}</a><span class="dot" id="pdot" style="display:${online.has(uid) ? 'block' : 'none'}"></span></div><div class="grow"><b style="font-size:.9rem">${esc(u.fullName)}</b><small id="pstat" style="display:block;color:var(--mut);font-size:.72rem">${online.has(uid) ? 'Online' : 'Offline'}</small></div><button class="btn sm danger" data-act="clearChat" data-id="${uid}"><i class="fas fa-eraser"></i> Clear</button>`;
  const d = await api(`/chats/${uid}/messages`); if (location.hash !== viewHash) return; $('#msgs').innerHTML = d.messages.map(msgHTML).join('') || '<div class="empty">Say hi 👋</div>'; scrollMsgs(); refreshUnread();
  $('#mtext').oninput = () => { socket.emit('typing', { to: uid, typing: true }); clearTimeout(typingTimer); typingTimer = setTimeout(() => socket.emit('typing', { to: uid, typing: false }), 1200); };
  $('#mform').onsubmit = async e => { e.preventDefault(); const t = $('#mtext').value.trim(); if (!t) return; $('#mtext').value = ''; try { const m = await api(`/chats/${uid}/messages`, 'POST', { text: t }); $('#msgs .empty')?.remove(); $('#msgs').insertAdjacentHTML('beforeend', msgHTML(m)); scrollMsgs(); socket.emit('typing', { to: uid, typing: false }); } catch {} };
}
const msgHTML = m => `<div class="msg ${m.sender === me._id ? 'me' : ''}" id="m-${m._id}">${esc(m.text)}<small>${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><button class="del" data-act="delMsg" data-id="${m._id}" title="Delete for me"><i class="fas fa-times"></i></button></div>`;
const scrollMsgs = () => { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; };
function updatePresence() { document.querySelectorAll('.citem').forEach(c => { const id = c.dataset.id, w = $('.avwrap', c); w.querySelector('.dot')?.remove(); if (online.has(id)) w.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); }); if (openChat && $('#pstat')) { $('#pstat').textContent = online.has(openChat) ? 'Online' : 'Offline'; $('#pdot').style.display = online.has(openChat) ? 'block' : 'none'; } }
async function onMessage({ message, from }) {
  if ($('#msgs') && openChat === from._id && location.hash.startsWith('#/chats')) { $('#msgs .empty')?.remove(); $('#msgs').insertAdjacentHTML('beforeend', msgHTML(message)); scrollMsgs(); api(`/chats/${from._id}/messages`).catch(() => {}); }
  else { toast(`${from.fullName}: ${message.text.slice(0, 40)}`); refreshUnread(); if (location.hash === '#/chats') route(); }
}
async function refreshUnread() { const l = await api('/chats'); unreadMsgs = l.reduce((a, c) => a + c.unread, 0); $('#msgBadge').textContent = unreadMsgs || ''; $('#msgBadge').dataset.n = unreadMsgs; }

/* ---------- notifications ---------- */
const notifText = n => `${n.from?.fullName || 'Someone'} ${{ like: 'liked your post', comment: 'commented on your post', friend_request: 'sent you a friend request', friend_accept: 'accepted your friend request' }[n.type]}`;
async function loadNotifs() {
  const d = await api('/notifications'); $('#bellBadge').textContent = d.unread || ''; $('#bellBadge').dataset.n = d.unread;
  $('#notifs').innerHTML = d.items.map(n => `<div class="notif ${n.read ? '' : 'unread'}" data-act="notif" data-id="${n._id}" data-t="${n.type}" data-u="${n.from?._id}">${av(n.from, 'sm')}<div><div>${esc(notifText(n))}</div><small style="color:var(--mut)">${ago(n.createdAt)}</small></div></div>`).join('') || '<div class="empty">No notifications</div>';
}
$('#bell').onclick = () => $('#panel').classList.add('open'); $('#closePanel').onclick = () => $('#panel').classList.remove('open');
$('#readAll').onclick = async () => { await api('/notifications/read-all', 'POST'); loadNotifs(); };

/* ---------- search ---------- */
let st; $('#search').oninput = e => { clearTimeout(st); const q = e.target.value.trim(), box = $('#results'); if (!q) return box.classList.remove('show');
  st = setTimeout(async () => { const l = await api('/users/search?q=' + encodeURIComponent(q)); box.innerHTML = l.map(u => `<a href="#/profile/${u._id}" class="person" style="padding:10px 14px" onclick="$('#results').classList.remove('show');$('#search').value=''">${av(u, 'sm')}<div class="info"><b>${esc(u.fullName)}</b><small>@${esc(u.username)}</small></div></a>`).join('') || '<div class="empty" style="padding:14px">No users found</div>'; box.classList.add('show'); }, 300); };
document.addEventListener('click', e => { if (!e.target.closest('.searchbox')) $('#results').classList.remove('show'); });

/* ---------- global click actions ---------- */
const done = (m) => { if (m) toast(m); route(); refreshFriendBadge(); };
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return; const { act, id } = el.dataset;
  try {
    switch (act) {
      case 'logout': return logout(); case 'editProfile': return editProfile(); case 'changePass': return changePass(); case 'blockedList': return blockedList(); case 'closeModal': return closeModal();
      case 'like': { const d = await api(`/posts/${id}/like`, 'POST'); el.className = d.liked ? 'liked' : ''; el.innerHTML = `<i class="${d.liked ? 'fas' : 'far'} fa-heart"></i> <span>${d.likesCount}</span>`; return; }
      case 'comments': { const box = $('#c-' + id); if (!box.hidden) return box.hidden = true; box.hidden = false; box.innerHTML = spinner; const [cs] = await Promise.all([api(`/posts/${id}/comments`)]); const owner = $('#p-' + id).querySelector('[data-act=delPost]');
        box.innerHTML = cs.map(c => commentHTML(c, !!owner)).join('') + `<form class="cform" data-p="${id}"><input placeholder="Write a comment..."><button class="btn sm">Send</button></form>`;
        box.querySelector('form').onsubmit = async ev => { ev.preventDefault(); const inp = ev.target.firstElementChild; if (!inp.value.trim()) return; const c = await api(`/posts/${id}/comments`, 'POST', { text: inp.value }); ev.target.insertAdjacentHTML('beforebegin', commentHTML(c, !!owner)); inp.value = ''; const s = el.querySelector('span'); s.textContent = +s.textContent + 1; }; return; }
      case 'delComment': { await api(`/posts/${el.dataset.p}/comments/${id}`, 'DELETE'); $('#cm-' + id).remove(); const count = $(`#p-${el.dataset.p} [data-act="comments"] span`); if (count) count.textContent = Math.max(0, Number(count.textContent) - 1); return toast('Comment deleted'); }
      case 'delPost': { if (!confirm('Delete this post?')) return; await api('/posts/' + id, 'DELETE'); $('#p-' + id).remove(); return toast('Post deleted'); }
      case 'share': { const url = `${location.origin}/index.html#/post/${id}`; if (navigator.share) return navigator.share({ title: 'SocioVerse post', url }).catch(() => {}); if (navigator.clipboard) { await navigator.clipboard.writeText(url); return toast('Link copied'); } return modal(`<h3>Share post</h3><input readonly value="${esc(url)}">`); }
      case 'addStory': { if (e.target.tagName === 'INPUT') return; const input = el.querySelector('input'); input.onclick = ev => ev.stopPropagation(); input.click(); return; }
      case 'viewStory': return openStory(+el.dataset.i); case 'closeStory': return closeStory(); case 'svNext': return openStory(sv.gi, sv.si + 1); case 'svPrev': return openStory(sv.gi, sv.si - 1);
      case 'svLike': { const d = await api(`/stories/${id}/like`, 'POST'); storyGroups[sv.gi].stories[sv.si].liked = d.liked; return openStory(sv.gi, sv.si); }
      case 'svDelete': { await api('/stories/' + id, 'DELETE'); toast('Story deleted'); closeStory(); return route(); }
      case 'svDetails': { const d = await api(`/stories/${id}/details`); const list = a => a.map(u => `<div class="person">${av(u, 'sm')}<div class="info"><b>${esc(u.fullName)}</b></div></div>`).join('') || '<div class="empty">None yet</div>'; const m = modal(`<h3>${d.views} views</h3><div class="hd">Viewers</div>${list(d.viewers)}<div class="hd">Likes (${d.likes.length})</div>${list(d.likes)}<div class="foot"><button class="btn ghost" data-act="closeModal">Close</button></div>`); m.style.zIndex = 90; return; }
      case 'frSend': await api('/friends/request/' + id, 'POST'); return done('Friend request sent'); case 'frCancel': await api('/friends/request/' + id, 'DELETE'); return done('Request cancelled');
      case 'frAccept': await api('/friends/accept/' + id, 'POST'); return done('Friend added'); case 'frReject': await api('/friends/reject/' + id, 'POST'); return done('Request rejected');
      case 'frRemove': if (!confirm('Remove this friend?')) return; await api('/friends/' + id, 'DELETE'); return done('Friend removed');
      case 'block': if (!confirm('Block this user? You will be unfriended and hidden from each other.')) return; await api(`/users/${id}/block`, 'POST'); toast('User blocked'); return location.hash = '#/feed';
      case 'unblock': await api(`/users/${id}/block`, 'DELETE'); el.closest('.person').remove(); return toast('User unblocked');
      case 'openChat': return location.hash = '#/chats/' + id;
      case 'delMsg': await api('/chats/message/' + id, 'DELETE'); $('#m-' + id).remove(); return toast('Message deleted for you');
      case 'clearChat': if (!confirm('Clear this chat for you?')) return; await api('/chats/' + id, 'DELETE'); toast('Chat cleared'); return route();
      case 'notif': { await api(`/notifications/${id}/read`, 'POST'); $('#panel').classList.remove('open'); loadNotifs(); location.hash = el.dataset.t.startsWith('friend') ? '#/friends' : '#/feed'; return; }
    }
  } catch (err) { if (err && err.message) console.warn(err.message); }
});
