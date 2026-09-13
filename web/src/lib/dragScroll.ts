/**
 * Rolagem por arraste com o mouse (no celular o toque já rola nativamente).
 * Arrastar mais que 6 px cancela o clique que viria no mouseup — assim botões e links
 * continuam funcionando com clique normal.
 */
export function installDragScroll() {
  if (typeof window === 'undefined') return () => {};
  let active = false, dragged = false, startX = 0, startY = 0, sx = 0, sy = 0;
  let el: HTMLElement | null = null;

  const scrollable = (t: Element | null): HTMLElement => {
    for (let n = t as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return n;
      if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth) return n;
    }
    return document.scrollingElement as HTMLElement;
  };

  const down = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable], canvas, .no-drag')) return;
    active = true; dragged = false; startX = e.clientX; startY = e.clientY;
    el = scrollable(t); sx = el.scrollLeft; sy = el.scrollTop;
  };
  const move = (e: MouseEvent) => {
    if (!active || !el) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragged && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    dragged = true;
    el.scrollTop = sy - dy;
    el.scrollLeft = sx - dx;
    e.preventDefault();
  };
  const up = () => { active = false; setTimeout(() => { dragged = false; }, 0); };
  const click = (e: MouseEvent) => { if (dragged) { e.stopPropagation(); e.preventDefault(); } };
  const drag = (e: DragEvent) => { if (active) e.preventDefault(); };

  window.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.addEventListener('click', click, true);
  window.addEventListener('dragstart', drag);
  document.documentElement.classList.add('drag-scroll');
  return () => {
    window.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    window.removeEventListener('click', click, true); window.removeEventListener('dragstart', drag);
  };
}
