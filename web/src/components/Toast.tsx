import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { sound } from '../lib/sound';

type ToastType = 'info' | 'success' | 'error';
interface T { id: number; msg: string; type: ToastType }
interface ToastState { items: T[]; push: (msg: string, type?: ToastType) => void; remove: (id: number) => void }

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    if (type === 'error') sound.play('error');
    set((s) => ({ items: [...s.items.slice(-2), { id, msg, type }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3200);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = (msg: string, type: ToastType = 'info') => useToast.getState().push(msg, type);

const icon: Record<ToastType, string> = { info: '/ui/ico-info.png', success: '/ui/check-green.png', error: '/ui/ico-lock01_s.png' };

export function ToastHost() {
  const items = useToast((s) => s.items);
  const remove = useToast((s) => s.remove);
  return (
    <div className="pointer-events-none fixed left-1/2 z-[100] flex w-full max-w-[480px] -translate-x-1/2 flex-col items-center gap-2 px-4" style={{ top: 'calc(var(--sat) + 10px)' }}>
      <AnimatePresence>
        {items.map((t) => (
          <motion.button key={t.id} initial={{ opacity: 0, y: -16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} onClick={() => remove(t.id)}
            className="toast pointer-events-auto flex w-full max-w-md items-center gap-3 font-extrabold shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
            <img src={icon[t.type]} className="ico h-8 w-8 shrink-0" alt="" />
            <span className={`flex-1 ${t.type === 'error' ? 'text-danger' : t.type === 'success' ? 'text-grass-deep' : 'text-navy-ink'}`}>{t.msg}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
