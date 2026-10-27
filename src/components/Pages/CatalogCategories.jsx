import {createElement} from 'react';
import {LayoutGrid,Sprout,Leaf,Heart} from 'lucide-react';

export function TrowelIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m14 10 4-4a2.1 2.1 0 0 0-3-3l-4 4M11 7l3 3-3 3-3-3zM8 10c-3 0-5 4-5 11 7 0 11-2 11-5l-3-3M6 18l4-4"/>
  </svg>;
}
const categories=[{key:'all',label:'All Products',icon:LayoutGrid},{key:'succulents',label:'Succulents',icon:Sprout},{key:'lettuce',label:'Lettuce',icon:Leaf},{key:'gardening_supply',label:'Gardening Supplies',icon:TrowelIcon},{key:'wishlist',label:'Wishlist',icon:Heart}];

export default function CatalogCategories({selected,count,onSelect}) {
  return <div className="catalog-category-nav" role="group" aria-label="Product categories">
    {categories.map(({key,label,icon:Icon})=><button key={key} type="button" aria-pressed={selected===key} onClick={()=>onSelect(key)} className={'catalog-category '+(key==='wishlist'?'catalog-category-wishlist':'')}>
      <span className="catalog-category-icon">{createElement(Icon,{size:24,'aria-hidden':true})}</span>
      <span>{label}{key==='wishlist'&&<span className="catalog-wishlist-count"> ({count})</span>}</span>
    </button>)}
  </div>;
}
