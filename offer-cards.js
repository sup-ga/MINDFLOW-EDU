/* MindFlow — rendu partagé des fiches d’offres */
(function(){
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const money=n=>Number(n||0).toLocaleString("fr-FR")+" FCFA";
 function render(rows,api){
  if(!rows.length)return '<div class="empty">Aucune offre ne correspond à ces filtres pour le moment.</div>';
  const groups=new Map();
  rows.forEach(o=>{const key=o.subject_name||o.subject?.name||"Autres matières";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o)});
  const markup = '<div class="mf-offer-groups">'+Array.from(groups.entries()).map(([subject,items])=>'<section class="mf-offer-group"><div class="mf-offer-group-head"><div><h3>'+esc(subject)+'</h3><p>'+items.length+' offre'+(items.length>1?'s':'')+' disponible'+(items.length>1?'s':'')+'</p></div></div><div class="mf-offer-track">'+items.map(o=>{
   const individual=o.offer_type==="individual",free=api.isFreeDirect(o),live=api.currentLiveSession(o.id),type=live?"En direct":individual?"Cours individuel":"Classe";
   const price=free?"Gratuit":individual?money(o.price)+" / heure":o.is_free?"Gratuit":o.price!=null?money(o.price):"Tarif à confirmer";
   const teacher=o.professional?.display_name||"Professeur MindFlow",profile=o.professional?.id?'profil-professionnel.html?id='+encodeURIComponent(o.professional.id):'';
   const image=o.image_url?'<img src="'+esc(o.image_url)+'" alt="Photo de présentation de '+esc(o.title||"l’offre")+'" loading="lazy" onerror="this.remove();this.parentElement.insertAdjacentHTML(\'beforeend\',\'<div class=&quot;mf-photo-fallback&quot; aria-label=&quot;Image indisponible&quot;>✦</div>\')">':'<div class="mf-photo-fallback" aria-hidden="true">✦</div>';
   return '<article class="mf-offer-card"><div class="mf-offer-media">'+image+'<span class="mf-offer-type">'+(live?'🔴 ':'')+esc(type)+'</span></div><div class="mf-offer-body"><h3>'+esc(o.title||"Offre de cours")+'</h3><div class="mf-offer-teacher">'+(o.professional?.avatar_url?'<img src="'+esc(o.professional.avatar_url)+'" alt="" loading="lazy">':'<span class="professional-avatar" aria-hidden="true">✦</span>')+'<div><strong>'+esc(teacher)+'</strong><span>'+esc(o.professional?.headline||"Enseignant MindFlow")+'</span></div></div><div class="mf-offer-subject">'+esc(subject)+'</div><p class="mf-offer-summary">'+esc(o.description||"Découvre les modalités de ce cours et contacte le professeur.")+'</p><div class="mf-offer-meta"><span>'+esc(api.modeName(o.delivery_mode))+'</span>'+(o.level?'<span>'+esc(o.level)+'</span>':'')+(o.duration_minutes&&!individual?'<span>'+esc(o.duration_minutes+" min")+'</span>':'')+'</div><div class="mf-offer-bottom"><span class="mf-offer-price">'+esc(price)+'</span><div class="mf-offer-actions">'+(profile?'<a class="mf-profile-link" href="'+esc(profile)+'">Profil</a>':'')+'<button class="btn primary" '+(free?'data-free-join="'+esc(o.id)+'"':'data-choose="'+esc(o.id)+'"')+'>'+(free?"Rejoindre":individual?"Demander":"Intégrer")+'</button></div></div></div></article>';
  }).join("")+'</div></section>').join("")+'</div>';
  requestAnimationFrame(()=>initAutoTracks());
  return markup;
 }
 function initAutoTracks(){
  document.querySelectorAll(".mf-offer-track").forEach(track=>{
   if(track.dataset.mfAutoReady==="1")return;
   track.dataset.mfAutoReady="1";
   const originals=[...track.children];
   if(originals.length<3||track.scrollWidth<=track.clientWidth+24||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
   originals.forEach(node=>{const clone=node.cloneNode(true);clone.setAttribute("aria-hidden","true");clone.querySelectorAll("a,button").forEach(el=>el.setAttribute("tabindex","-1"));clone.querySelectorAll("button[data-choose],button[data-free-join]").forEach(button=>button.addEventListener("click",event=>{event.preventDefault();const key=button.dataset.choose?"choose":"freeJoin",value=button.dataset.choose||button.dataset.freeJoin;const original=[...track.querySelectorAll(button.dataset.choose?"button[data-choose]":"button[data-free-join]")].find(item=>(item.dataset.choose||item.dataset.freeJoin)===value);original?.click()}));track.appendChild(clone)});
   track.classList.add("is-auto");
   let paused=false,last=0,raf=0,cycleWidth=0;
   const measure=()=>{const first=originals[0],last=originals[originals.length-1];cycleWidth=last.offsetLeft+last.offsetWidth-first.offsetLeft};
   measure();
   const pause=()=>{paused=true;clearTimeout(resumeTimer)};
   let resumeTimer;
   const resume=()=>{clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{paused=false},1800)};
   const tick=now=>{
    if(!track.isConnected)return;
    if(!last)last=now;
    const elapsed=Math.min(now-last,40);last=now;
    if(!paused&&cycleWidth>0){
     track.scrollLeft+=elapsed*.022;
     if(track.scrollLeft>=cycleWidth)track.scrollLeft-=cycleWidth;
    }
    raf=requestAnimationFrame(tick);
   };
   track.addEventListener("pointerdown",pause,{passive:true});
   track.addEventListener("pointerup",resume,{passive:true});
   track.addEventListener("pointercancel",resume,{passive:true});
   track.addEventListener("mouseenter",pause);
   track.addEventListener("mouseleave",resume);
   track.addEventListener("focusin",pause);
   track.addEventListener("focusout",resume);
   track.addEventListener("wheel",()=>{pause();resume()},{passive:true});
   window.addEventListener("resize",measure,{passive:true});
   raf=requestAnimationFrame(tick);
  });
 }
 window.MFOfferCards={render};
})();