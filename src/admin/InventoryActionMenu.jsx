import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export default function InventoryActionMenu({ label, productName, icon: MenuIcon, items }) {
  const TriggerIcon = MenuIcon;
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const close = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  };
  const open = () => {
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    setPosition({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), width,
      ...(below >= 220 || below >= above ? { top: rect.bottom + 4, maxHeight: Math.max(80, below) } : { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(80, above) }) });
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector('[role="menuitem"]')?.focus();
    const outside = event => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const dismiss = () => setPosition(null);
    const scroll = event => { if (!menu.current?.contains(event.target)) dismiss(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [position]);
  const navigate = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { event.preventDefault(); close(true); return; }
    const buttons = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
    if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
  };
  return <>
    <button ref={trigger} type="button" aria-label={`${label} actions for ${productName}`} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
      onClick={() => position ? close() : open()} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); } }}>
      {TriggerIcon&&<TriggerIcon size={14} aria-hidden="true" />}{label}<ChevronDown size={12} aria-hidden="true" />
    </button>
    {position && createPortal(<div ref={menu} id={id} role="menu" aria-label={`${label} actions for ${productName}`} onKeyDown={navigate}
      style={position} className="fixed z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
      <InventoryMenuItems items={items} onSelect={action=>{close(true);action();}} />
    </div>, document.body)}
  </>;
}

export function InventoryMenuItems({items,onSelect}) {
  return <>
      {items.map(item => { const { label: title, action, disabled, explanation } = item; const ItemIcon = item.icon; return <button key={title} role="menuitem" type="button" tabIndex={-1} aria-disabled={disabled || undefined}
        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-emerald-700 ${disabled ? 'text-slate-400' : 'text-slate-700 hover:bg-emerald-50'}`}
        onClick={() => { if (!disabled) onSelect(action); }}>
        {ItemIcon&&<ItemIcon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}<span>{title}{disabled && explanation && <span className="mt-0.5 block text-xs">{explanation}</span>}</span>
      </button>; })}
  </>;
}
