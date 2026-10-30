// Small UI toolkit: icons, formatters, badges, toasts and modals.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICONS = {
  pulse: '<path d="M3 12h4l2.5-7 4 14 2.5-7H21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  'arrow-right': '<path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  'arrow-left': '<path d="M19 12H5m5-5-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  'check-circle': '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8 12 2.5 2.5L16 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1" fill="currentColor"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1" fill="currentColor"/>',
  water: '<path d="M12 3.5c3.2 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.3-6 5.5-10Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  waves: '<path d="M3 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2M3 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  road: '<path d="M8 3 5 21M16 3l3 18M12 5v3M12 12v3M12 19v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  bulb: '<path d="M9 18h6M10 21h4M8 14a5.5 5.5 0 1 1 8 0c-.9 1-1 2-1 3H9c0-1-.1-2-1-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.9 7.5 9.5 4.4-1.6 7.5-4.9 7.5-9.5V6L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  tap: '<path d="M9 20V9a2 2 0 0 1 4 0v3h1.5a2.5 2.5 0 0 1 2.5 2.5V20M5 20h14M12 6V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  bench: '<path d="M4 10h16M6 10V7h12v3M5 14h14M7 10v8M17 10v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  sparkles: '<path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.7L12 18l-1.7-5.6L5 10.7 10.3 9 12 3.5ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 20c.4-3.4 2.6-5.2 5.5-5.2s5.1 1.8 5.5 5.2M16 5.5a3 3 0 0 1 0 5.8M17.5 14.8c2.1.4 3.4 2.1 3.7 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.7 4M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  'chevron-down': '<path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  locate: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  activity: '<path d="M3 12h4l2.5-7 4 14 2.5-7H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  zap: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  link: '<path d="M9.5 14.5 14.5 9.5M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  send: '<path d="m21 3-7.5 18-3-7.5L3 10.5 21 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14M15 6v14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  'trend-up': '<path d="M3 17 9 11l4 4 8-9M21 6v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v6H4V5h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  building: '<path d="M4 21V5l8-2v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7h6L5 7ZM19 7l-3 7h6l-3-7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

export function icon(name, size = 18, extra = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;
}

export const CATEGORY_META = {
  Waterlogging: { color: '#2563eb', soft: '#e2ecf7', icon: 'water' },
  Drainage: { color: '#0f766e', soft: '#dcece9', icon: 'waves' },
  'Road Damage': { color: '#b45309', soft: '#f8e8cc', icon: 'road' },
  'Waste Overflow': { color: '#7c3aed', soft: '#eee7f7', icon: 'trash' },
  Streetlight: { color: '#b7790b', soft: '#f8e8cc', icon: 'bulb' },
  'Safety Hazard': { color: '#dc2626', soft: '#f8e1dc', icon: 'shield' },
  'Water Supply': { color: '#0891b2', soft: '#dcf0f4', icon: 'tap' },
  'Public Property': { color: '#475569', soft: '#e8ecef', icon: 'bench' },
};

export function catMeta(category) {
  return CATEGORY_META[category] || { color: '#64716f', soft: '#eef0ee', icon: 'flag' };
}

export const STATUS_META = {
  new: { label: 'New', citizen: 'Received', color: '#64748b' },
  review: { label: 'In review', citizen: 'Being reviewed', color: '#7c3aed' },
  assigned: { label: 'Assigned', citizen: 'Assigned to a team', color: '#2563eb' },
  in_progress: { label: 'In progress', citizen: 'Work started', color: '#d97706' },
  resolved: { label: 'Resolved', citizen: 'Resolved', color: '#059669' },
  rejected: { label: 'Closed', citizen: 'Closed', color: '#94a3b8' },
};

export const PRIORITY_META = {
  Critical: { color: '#b3261e', soft: '#f8e1dc', rank: 0, sla: 4 },
  High: { color: '#b56f0d', soft: '#f8e8cc', rank: 1, sla: 24 },
  Medium: { color: '#2563a8', soft: '#e2ecf7', rank: 2, sla: 72 },
  Low: { color: '#5b6b73', soft: '#eef0ee', rank: 3, sla: 168 },
};

export function priorityPill(level) {
  return `<span class="pill dot ${String(level).toLowerCase()}">${esc(level)}</span>`;
}

export function statusPill(status, citizen = false) {
  const meta = STATUS_META[status] || { label: status, color: '#64748b' };
  const label = citizen ? meta.citizen : meta.label;
  return `<span class="pill" style="background:${meta.color}18;color:${meta.color}">${esc(label)}</span>`;
}

export function categoryTag(category, { small = false } = {}) {
  const meta = catMeta(category);
  return `<span class="pill" style="background:${meta.soft};color:${meta.color};${small ? 'height:22px;padding:0 8px;font-size:11px' : ''}">${icon(meta.icon, small ? 12 : 13)} ${esc(category)}</span>`;
}

export function categoryIcon(category, size = 34) {
  const meta = catMeta(category);
  return `<span class="cat-dot" style="background:${meta.soft};color:${meta.color}">${icon(meta.icon, size * 0.5)}</span>`;
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...opts });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

export function fmtHours(h) {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

export function pct(n) { return `${Math.round(n * 100)}%`; }

export function scoreBar(score, color = 'var(--green-3)') {
  return `<div class="conf-bar"><i style="width:${Math.max(2, Math.min(100, score))}%;background:${color}"></i></div>`;
}

let toastTimer = 0;
export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'error' ? icon('alert-circle', 15) : type === 'success' ? icon('check-circle', 15) : ''}<span>${esc(message)}</span>`;
  root.appendChild(el);
  clearTimeout(toastTimer);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3400);
}

export function openModal({ title, body, footer = '', onClose = null, wide = false }) {
  const root = document.createElement('div');
  root.className = 'modal-root';
  root.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${wide ? 'width:min(820px,100%)' : ''}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => {
    root.remove();
    if (!document.querySelector('.modal-root')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  return { root, close };
}

export function emptyState(title, text, iconName = 'search') {
  return `<div class="empty"><div class="ico">${icon(iconName, 22)}</div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
}

export function relativeDue(dueAt) {
  if (!dueAt) return { text: 'No due date', late: false };
  const diff = new Date(dueAt).getTime() - Date.now();
  const hours = Math.abs(diff) / 36e5;
  if (diff < 0) return { text: `Overdue ${fmtHours(hours)}`, late: true };
  return { text: `Due in ${fmtHours(hours)}`, late: false };
}

export function debounce(fn, ms = 350) {
  let t = 0;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function escapeAttr(s) { return esc(s).replace(/`/g, '&#96;'); }

export function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
