/* MindFlow — rendu partagé des fiches d’offres (grille responsive, sans carrousel) */
(function(){
 "use strict";
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const norm=s=>String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
 const money=n=>Number(n||0).toLocaleString("fr-FR")+" FCFA";

 /* Un pictogramme par matière : sert d’illustration quand l’enseignant n’a pas ajouté de photo. */
 const GLYPHS=[["chimi","⚗️"],["physi","⚛️"],["math","➗"],["informat","💻"],["program","💻"],["code","💻"],["marketing","📈"],["astro","🪐"],["biolog","🧬"],["svt","🧬"],["histoire","🏛️"],["geograph","🌍"],["franc","📖"],["litter","📖"],["angl","🗣️"],["langue","🗣️"],["philo","💭"],["econom","💼"],["gestion","💼"],["compta","🧾"],["music","🎵"],["dessin","🎨"],["art","🎨"],["droit","⚖️"],["sant","🩺"],["sport","⚽"],["cuisine","🍳"],["design","✏️"]];
 const glyph=subject=>{const n=norm(subject);const hit=GLYPHS.find(([k])=>n.includes(k));return hit?hit[1]:"✦"};
 /* Une teinte stable par matière : la même matière garde toujours les mêmes couleurs. */
 const tone=s=>{let h=0;for(const ch of String(s||""))h=(h*31+ch.codePointAt(0))>>>0;return h%6};
 const initials=name=>String(name||"MF").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"MF";

 function priceParts(o,free,individual){
  if(free)return {main:"Gratuit",unit:"",free:true};
  if(individual)return {main:money(o.price),unit:"/ heure"};
  if(o.is_free)return {main:"Gratuit",unit:"",free:true};
  if(o.price!=null)return {main:money(o.price),unit:""};
  return {main:"Tarif à confirmer",unit:""};
 }

 function card(o,i,api){
  const individual=o.offer_type==="individual",free=api.isFreeDirect(o),live=api.currentLiveSession(o.id);
  const type=live?"En direct":individual?"Cours individuel":"Classe";
  const subject=o.subject_name||o.subject?.name||"Autres matières";
  const price=priceParts(o,free,individual);
  const teacher=o.professional?.display_name||"Professeur MindFlow";
  const profile=o.professional?.id?"profil-professionnel.html?id="+encodeURIComponent(o.professional.id):"";
  const t=tone(subject);
  const photo=o.image_url?'<img class="mf-photo" src="'+esc(o.image_url)+'" alt="Photo de présentation de '+esc(o.title||"l’offre")+'" loading="lazy" onerror="this.remove()">':"";
  const avatar=o.professional?.avatar_url?'<img class="mf-av" src="'+esc(o.professional.avatar_url)+'" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'mf-av\',textContent:\''+esc(initials(teacher))+'\'}))">':'<span class="mf-av" aria-hidden="true">'+esc(initials(teacher))+'</span>';
  const who='<div class="mf-who">'+avatar+'<div class="mf-who-text"><strong>'+esc(teacher)+'</strong><span>'+esc(o.professional?.headline||"Enseignant MindFlow")+'</span></div>'+(profile?'<span class="mf-who-go" aria-hidden="true">Profil →</span>':"")+'</div>';
  const meta=['<span class="mf-tag">'+esc(api.modeName(o.delivery_mode))+'</span>',o.level?'<span class="mf-tag">'+esc(o.level)+'</span>':"",o.duration_minutes&&!individual?'<span class="mf-tag">'+esc(o.duration_minutes+" min")+'</span>':""].join("");
  return '<article class="mf-card" style="--i:'+Math.min(i,12)+'">'
   +'<div class="mf-media"><div class="mf-art tone-'+t+'" aria-hidden="true"><span class="mf-glyph">'+glyph(subject)+'</span><small>MindFlow · '+esc(individual?"Cours individuel":"Classe")+'</small></div>'+photo
   +'<div class="mf-badges"><span class="mf-badge'+(live?" live":"")+'">'+(live?'<i></i>':"")+esc(type)+'</span>'+(price.free?'<span class="mf-badge free">Gratuit</span>':"")+'</div></div>'
   +'<div class="mf-body"><span class="mf-kicker">'+esc(subject)+'</span>'
   +'<h3>'+esc(o.title||"Offre de cours")+'</h3>'
   +'<p class="mf-summary">'+esc(o.description||"Découvre les modalités de ce cours et contacte le professeur.")+'</p>'
   +(profile?'<a class="mf-who-link" href="'+esc(profile)+'" aria-label="Voir le profil de '+esc(teacher)+'">'+who+'</a>':who)
   +'<div class="mf-meta">'+meta+'</div>'
   +'<div class="mf-foot"><span class="mf-price'+(price.free?" is-free":"")+'">'+esc(price.main)+(price.unit?' <small>'+esc(price.unit)+'</small>':"")+'</span>'
   +'<button type="button" class="btn primary" '+(free?'data-free-join="'+esc(o.id)+'"':'data-choose="'+esc(o.id)+'"')+'>'+(free?"Rejoindre":individual?"Demander":"Intégrer")+'</button></div></div></article>';
 }

 function render(rows,api){
  if(!rows.length)return '<div class="empty"><strong>Aucune offre ne correspond à ces filtres pour le moment.</strong><br>Essaie une autre matière ou retire un filtre.</div>';
  return rows.map((o,i)=>card(o,i,api)).join("");
 }

 /* Petit éventail de fiches en perspective pour l’en-tête (jusqu’à 3 offres réelles). */
 function showcase(rows){
  const picks=rows.slice(0,3);
  return picks.map(o=>{
   const subject=o.subject_name||o.subject?.name||"Autres matières",individual=o.offer_type==="individual",free=o.is_free===true&&Number(o.price)===0;
   const price=priceParts(o,free,individual);
   const teacher=o.professional?.display_name||"Professeur MindFlow";
   const photo=o.image_url?'<img src="'+esc(o.image_url)+'" alt="" loading="lazy" onerror="this.remove()">':"";
   return '<div class="mf-mini"><div class="mf-mini-top tone-'+tone(subject)+'"><span>'+glyph(subject)+'</span>'+photo+'</div><div class="mf-mini-body"><small>'+esc(subject)+'</small><strong>'+esc(o.title||"Offre de cours")+'</strong><div class="mf-mini-foot"><span>'+esc(teacher)+'</span><b>'+esc(price.main)+'</b></div></div></div>';
  }).join("");
 }

 /* Inclinaison 3D douce au survol (souris uniquement, désactivée si l’utilisateur limite les animations). */
 const fine=window.matchMedia("(hover:hover) and (pointer:fine)"),calm=window.matchMedia("(prefers-reduced-motion: reduce)");
 document.addEventListener("pointermove",e=>{
  if(e.pointerType==="touch"||!fine.matches||calm.matches)return;
  const c=e.target.closest&&e.target.closest(".mf-card");if(!c)return;
  const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  c.style.setProperty("--ry",((x-.5)*7).toFixed(2)+"deg");c.style.setProperty("--rx",((.5-y)*5).toFixed(2)+"deg");
  c.style.setProperty("--mx",(x*100).toFixed(1)+"%");c.style.setProperty("--my",(y*100).toFixed(1)+"%");
 },{passive:true});
 document.addEventListener("pointerout",e=>{
  const c=e.target.closest&&e.target.closest(".mf-card");
  if(c&&!c.contains(e.relatedTarget)){["--rx","--ry","--mx","--my"].forEach(p=>c.style.removeProperty(p))}
 });

 window.MFOfferCards={render,showcase,glyph,tone};
})();
