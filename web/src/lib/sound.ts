/**
 * Sons de interface sintetizados (Web Audio) — sem arquivos. Estilo "cartoon casual":
 * clique curto e macio, "pop" nas abas, sinal de erro e fanfarra curta no gol.
 * Preferência salva em localStorage (brgol.som = "0" desliga).
 */
const KEY = 'brgol.som';
let ctx: AudioContext | null = null;

export const sound = {
  enabled(): boolean { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } },
  setEnabled(v: boolean) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} if (v) sound.play('tap'); },
  play(kind: 'tap' | 'pop' | 'error' | 'goal' | 'coin' = 'tap') {
    if (!sound.enabled()) return;
    try {
      ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number) => {
        const o = ctx!.createOscillator(); const g = ctx!.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t + start);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + start + dur);
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(gain, t + start + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(ctx!.destination); o.start(t + start); o.stop(t + start + dur + 0.02);
      };
      switch (kind) {
        case 'tap': tone(900, 0, 0.06, 'triangle', 0.14, 500); break;                 // clique macio
        case 'pop': tone(420, 0, 0.09, 'sine', 0.2, 880); break;                       // troca de aba
        case 'error': tone(220, 0, 0.12, 'square', 0.08, 160); tone(180, 0.12, 0.16, 'square', 0.08, 120); break;
        case 'coin': tone(1320, 0, 0.07, 'sine', 0.16); tone(1760, 0.07, 0.12, 'sine', 0.16); break;
        case 'goal': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, 'triangle', 0.16)); break;
      }
    } catch {}
  },
};

/** Toca o clique em qualquer botão/link/aba da interface (uma vez por toque). */
export function installClickSounds() {
  const handler = (e: Event) => {
    const t = (e.target as HTMLElement)?.closest?.('button, a, [role="button"], label, summary');
    if (!t || (t as HTMLButtonElement).disabled || t.closest('.no-sound')) return;
    sound.play(t.closest('nav') ? 'pop' : 'tap');
  };
  document.addEventListener('pointerdown', handler, true);
  return () => document.removeEventListener('pointerdown', handler, true);
}
