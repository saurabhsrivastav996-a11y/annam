import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-leaf-300 bg-leaf-50 text-leaf-800' },
  error: { icon: AlertCircle, cls: 'border-red-300 bg-red-50 text-red-800' },
  info: { icon: Info, cls: 'border-stone-300 bg-white text-stone-800' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message, type = 'info', ms = 3500) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[1000] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map(({ id, message, type }) => {
          const { icon: Icon, cls } = STYLES[type] || STYLES.info;
          return (
            <div
              key={id}
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg ${cls}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1">{message}</span>
              <button onClick={() => dismiss(id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext).toast;
