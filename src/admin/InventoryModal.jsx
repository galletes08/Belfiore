import {useEffect,useRef} from 'react';
import {Leaf} from 'lucide-react';
const buttonClass='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
export default function Modal({ title, onClose, busy, children, freshness = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const overflow=document.body.style.overflow;
    if(freshness)document.body.style.overflow='hidden';
    dialog.showModal();
    return () => {dialog.close();if(freshness)document.body.style.overflow=overflow;};
  }, [freshness]);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    aria-label={title} className={'m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl backdrop:bg-slate-900/40 sm:p-6 '+(freshness?'max-w-[980px]':'max-w-3xl')}>
    <div className="mb-5 flex items-center justify-between gap-4"><h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">{freshness&&<Leaf size={21} className="shrink-0 text-emerald-800"/>}{title}</h2>
      <button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className={buttonClass}>{freshness?<span aria-hidden="true">?</span>:'Close'}</button></div>{children}
  </dialog>;
}
