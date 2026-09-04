/** Utilidades de DOM e iconografia (trazo fino, estilo SF Symbols). */

/** Crea un elemento con props y children en una sola llamada. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') node.innerHTML = value;
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(3)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Anyade hijos ignorando los nulos (las secciones vacias devuelven null). */
export function append(parent, ...children) {
  for (const child of children.flat(3)) if (child) parent.append(child);
  return parent;
}

export const clear = (node) => { while (node.firstChild) node.firstChild.remove(); return node; };

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>',
  tv: '<rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M8 21h8"/>',
  stack: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M6 3h12M4.5 4.5h15"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  sparkle: '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/><path d="M18.5 3.5 19 5.2l1.7.5-1.7.6-.5 1.7-.5-1.7-1.7-.6 1.7-.5.5-1.7Z"/>',
  play: '<path d="M7 4.5 19.5 12 7 19.5Z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7L7 19.5l1-5.7-4.1-4 5.7-.8L12 3.8Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>'
};

/** Devuelve un SVG del set de iconos. */
export function icon(name, { filled = false, size } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', filled ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (size) { svg.style.width = `${size}px`; svg.style.height = `${size}px`; }
  svg.innerHTML = PATHS[name] || '';
  return svg;
}

let toastStack = null;

/** Aviso efimero en la parte inferior. */
export function toast(message, { type = 'info', duration = 3200 } = {}) {
  if (!toastStack) {
    toastStack = el('div', { class: 'toast-stack' });
    document.body.append(toastStack);
  }
  const node = el('div', { class: `toast ${type === 'error' ? 'error' : ''}` }, message);
  toastStack.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 320);
  }, duration);
}

/** Debounce sencillo para el buscador. */
export function debounce(fn, ms = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const formatCount = (n) => new Intl.NumberFormat('es-ES').format(n || 0);

export function timeAgo(ts) {
  if (!ts) return 'nunca';
  const seconds = Math.round((Date.now() - ts) / 1000);
  const units = [['año', 31536000], ['mes', 2592000], ['día', 86400], ['hora', 3600], ['minuto', 60]];
  for (const [name, size] of units) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `hace ${value} ${name}${value > 1 ? (name === 'mes' ? 'es' : 's') : ''}`;
  }
  return 'hace un momento';
}
