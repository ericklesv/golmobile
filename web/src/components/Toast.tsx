import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';

type ToastType = 'info' | 'success' | 'error';
interface T { id: number; msg: string; type: ToastType }
interface ToastState { items: T[]; push: (msg: string, type?: ToastType) => void; remove: (id: number) => void }

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (msg, type = 'info') => {
    const id = Date.now() + Math.random();
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
    <div className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4" style={{ top: 'calc(var(--sat) + 10px)' }}>
      <AnimatePresence>
        {items.map((t) => (
          <motion.button key={t.id} initial={{ opacity: 0, y: -16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} onClick={() => remove(t.id)}
            className="toast pointer-events-auto flex w-full max-w-md items-center gap-2 text-sm font-extrabold">
            <img src={icon[t.type]} className="ico h-6 w-6" alt="" />
            <span className={t.type === 'error' ? 'text-danger' : t.type === 'success' ? 'text-grass-deep' : ''}>{t.msg}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
