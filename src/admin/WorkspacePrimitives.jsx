import {createElement} from 'react';
import {NavLink} from 'react-router-dom';

export function WorkspaceNavLink({to,end,label,description,icon:Icon,onNavigate}){
 return <NavLink to={to} end={end} onClick={onNavigate} className={({isActive})=>`group relative flex min-h-[54px] items-center gap-3 rounded-xl px-2 py-2 no-underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${isActive?'bg-[#c8f8e3] text-[#062c22] shadow-sm':'text-white/90 hover:bg-white/[0.07] hover:text-white'}`}>
  {({isActive})=><><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${isActive?'border-emerald-900/10 bg-[#073b2d] text-emerald-100':'border-white/[0.07] bg-white/[0.06] text-emerald-100'}`}>{createElement(Icon,{size:17,strokeWidth:1.8,'aria-hidden':true})}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold leading-4">{label}</span><span className={`mt-0.5 block truncate text-[10px] leading-4 ${isActive?'text-emerald-950/65':'text-white/50'}`}>{description}</span></span>{isActive&&<span className="mr-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true"/>}</>}
 </NavLink>;
}
export function WorkspacePageHeader({eyebrow,title,description,children,notification}){
 return <header className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{eyebrow}</p><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="min-w-0 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{(children||notification)&&<div className="flex max-w-full flex-wrap items-center gap-2">{children}{notification}</div>}</div>{description&&<p className="text-sm leading-6 text-slate-500">{description}</p>}</header>;
}
export function SummaryCard({label,value,note,icon:Icon,attention=false,onClick}){
 return <article className="relative flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{onClick&&<button aria-label={'View '+label.toLowerCase()} className="absolute inset-0 rounded-xl hover:bg-emerald-50/30 focus-visible:outline-2 focus-visible:outline-emerald-700" onClick={onClick}/>}<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${attention?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700'}`}>{createElement(Icon,{size:18,'aria-hidden':true})}</span><div className="min-w-0"><h2 className="text-xs font-semibold text-slate-600">{label}</h2><p className="mt-1 text-2xl font-bold text-[#1f5a43]">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p></div></article>;
}
