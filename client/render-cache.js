const htmlValues = new WeakMap();
export function updateText(node, value) {
  const text = String(value); if (node.textContent === text) return false;
  node.textContent = text; return true;
}
export function updateHTML(node, html) {
  if (node.id === 'modal') { node.innerHTML = html; return true; }
  if (htmlValues.get(node) === html) return false;
  node.innerHTML = html; htmlValues.set(node, html); return true;
}
export function updateProperty(node, key, value) {
  if (node[key] === value) return false; node[key] = value; return true;
}
