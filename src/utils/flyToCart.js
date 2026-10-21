let activeFlight;

export function flyToCart(source, imageUrl) {
  activeFlight?.();
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const target=document.querySelector('[data-cart-target]');
  if(motion.matches||!source?.getBoundingClientRect||!target||!imageUrl)return;
  const from=source.getBoundingClientRect(),to=target.getBoundingClientRect();
  if(!to.width||!to.height||from.bottom<0||from.top>window.innerHeight)return;
  const image=document.createElement('img');
  image.src=imageUrl;image.alt='';image.setAttribute('aria-hidden','true');
  const x=from.left+from.width/2-24,y=from.top+from.height/2-24;
  Object.assign(image.style,{position:'fixed',left:`${x}px`,top:`${y}px`,width:'48px',height:'48px',objectFit:'cover',borderRadius:'12px',pointerEvents:'none',zIndex:'1200',boxShadow:'0 4px 16px #064e5933'});
  if(typeof image.animate!=='function')return;
  document.body.append(image);
  const dx=to.left+to.width/2-24-x,dy=to.top+to.height/2-24-y;
  const animation=image.animate([
    {transform:'translate(0,0) scale(1)',opacity:1},
    {transform:`translate(${dx*.5}px,${dy*.5-35}px) scale(.8)`,opacity:.95,offset:.5},
    {transform:`translate(${dx}px,${dy}px) scale(.25)`,opacity:0}
  ],{duration:550,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'});
  const cleanup=()=>{animation.cancel();image.remove();motion.removeEventListener('change',cleanup);if(activeFlight===cleanup)activeFlight=undefined;};
  activeFlight=cleanup;motion.addEventListener('change',cleanup);
  image.onerror=cleanup;
  animation.finished.then(cleanup,cleanup);
}
