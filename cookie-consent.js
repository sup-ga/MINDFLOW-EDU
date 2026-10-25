(()=>{'use strict';
const KEY='mindflow_cookie_consent_v2';
const style=document.createElement('style');style.textContent=`
#mf-cookie-banner,#mf-cookie-panel{font:15px/1.5 system-ui,-apple-system,sans-serif;color:#f7f7fb;background:#171725;border:1px solid #ffffff2b;box-shadow:0 12px 50px #0008;border-radius:18px;z-index:99999}
#mf-cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;max-width:980px;margin:auto;padding:20px;display:none}
#mf-cookie-banner h2,#mf-cookie-panel h2{font-size:1.15rem;margin:0 0 8px;color:#fff}
#mf-cookie-banner p,#mf-cookie-panel p{margin:0 0 12px;color:#d0cede}
.mf-cookie-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.mf-cookie-actions button{border:1px solid #ffffff45;border-radius:999px;padding:10px 16px;background:transparent;color:#fff;cursor:pointer;font:inherit}
.mf-cookie-actions .mf-primary{background:#a9f4d0;color:#10131c;border-color:#a9f4d0;font-weight:700}
#mf-cookie-banner a,#mf-cookie-panel a{color:#a9f4d0;text-decoration:underline}
#mf-cookie-panel{position:fixed;inset:0;margin:auto;width:min(520px,calc(100% - 28px));height:max-content;padding:22px;display:none}
.mf-cookie-option{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #ffffff20}
.mf-cookie-option input{margin-top:5px;accent-color:#a9f4d0}
.mf-cookie-option small{display:block;color:#c3c7d5}
.mf-cookie-manage{cursor:pointer}
@media(max-width:520px){#mf-cookie-banner{left:8px;right:8px;bottom:8px;padding:15px}.mf-cookie-actions button{flex:1}}
`;document.head.appendChild(style);
const GA_ID='G-3WCB9RPH3Y';
const consentNow=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
function applyAnalyticsConsent(stats){
  if(!stats){if(typeof window.gtag==='function')window.gtag('consent','update',{'analytics_storage':'denied'});return;}
  if(!window.mindflowGAInitialized){
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
    window.gtag('js',new Date());
    window.gtag('consent','default',{'analytics_storage':'denied'});
    window.gtag('consent','update',{'analytics_storage':'granted'});
    window.gtag('config',GA_ID,{'send_page_view':false,'anonymize_ip':true});
    const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);document.head.appendChild(script);
    window.mindflowGAInitialized=true;
    window.gtag('event','page_view',{'page_title':document.title,'page_location':location.href,'page_path':location.pathname});
  }else if(typeof window.gtag==='function'){
    window.gtag('consent','update',{'analytics_storage':'granted'});
    window.gtag('event','page_view',{'page_title':document.title,'page_location':location.href,'page_path':location.pathname});
  }
}
function save(stats){const value={essential:true,statistics:!!stats,updatedAt:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(value));applyAnalyticsConsent(value.statistics);hide();window.dispatchEvent(new CustomEvent('mindflow:cookie-consent',{detail:value}));}
function hide(){const b=document.getElementById('mf-cookie-banner'),p=document.getElementById('mf-cookie-panel');if(b)b.style.display='none';if(p)p.style.display='none';}
const banner=document.createElement('section');banner.id='mf-cookie-banner';banner.setAttribute('aria-label','Consentement aux cookies');banner.innerHTML='<h2>Votre confidentialité compte</h2><p>MindFlow utilise le stockage essentiel au fonctionnement du site. Avec votre accord, Google Analytics mesure la fréquentation pour nous aider à améliorer MindFlow. Les statistiques restent désactivées tant que vous ne les avez pas acceptées. Vous pouvez refuser ou personnaliser votre choix. <a href="politique-confidentialite.html">Lire la politique de confidentialité</a>.</p><div class="mf-cookie-actions"><button type="button" class="mf-primary" id="mf-cookie-accept">Accepter</button><button type="button" id="mf-cookie-reject">Refuser</button><button type="button" id="mf-cookie-customize">Personnaliser</button></div>';
const panel=document.createElement('section');panel.id='mf-cookie-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','mf-cookie-title');panel.innerHTML='<h2 id="mf-cookie-title">Personnaliser mes cookies</h2><p>Les cookies et stockages essentiels sont toujours actifs pour les fonctions nécessaires, comme la mémorisation de votre choix et le fonctionnement du compte. Les statistiques restent facultatives.</p><div class="mf-cookie-option"><input type="checkbox" checked disabled id="mf-essential"><label for="mf-essential"><strong>Essentiels — toujours actifs</strong><small>Nécessaires au fonctionnement et à la sécurité du site.</small></label></div><div class="mf-cookie-option"><input type="checkbox" id="mf-statistics"><label for="mf-statistics"><strong>Statistiques — facultatives</strong><small>Désactivées par défaut. Si un outil est ajouté, il ne pourra être chargé qu’après votre accord.</small></label></div><div class="mf-cookie-actions"><button type="button" class="mf-primary" id="mf-cookie-save">Enregistrer mon choix</button><button type="button" id="mf-cookie-cancel">Annuler</button></div>';
document.body.append(banner,panel);
document.getElementById('mf-cookie-accept').addEventListener('click',()=>save(true));
document.getElementById('mf-cookie-reject').addEventListener('click',()=>save(false));
document.getElementById('mf-cookie-customize').addEventListener('click',()=>{document.getElementById('mf-statistics').checked=!!consentNow()?.statistics;panel.style.display='block';});
document.getElementById('mf-cookie-save').addEventListener('click',()=>save(document.getElementById('mf-statistics').checked));
document.getElementById('mf-cookie-cancel').addEventListener('click',()=>{panel.style.display='none';const existingConsent=consentNow();if(!existingConsent)banner.style.display='block';else applyAnalyticsConsent(!!existingConsent.statistics);});
// Show the consent choices after a short delay on every visit until a choice is saved.
// Never hide the banner automatically: users must be able to choose accept, reject, or customize.
if(!consentNow()){
  // Show immediately on first visit with this consent version, then gently animate it in.
  banner.style.display='block';
  banner.style.opacity='1';
  banner.style.transform='translateY(0)';
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-manage-cookies]');if(!el)return;e.preventDefault();const c=consentNow();document.getElementById('mf-statistics').checked=!!c?.statistics;panel.style.display='block';});
document.querySelectorAll('footer').forEach(f=>{if(!f.querySelector('[data-legal-links]')){const nav=document.createElement('nav');nav.dataset.legalLinks='true';nav.setAttribute('aria-label','Informations légales');nav.style.cssText='display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;font-size:.92rem';nav.innerHTML='<a href="a-propos.html">À propos</a><a href="politique-confidentialite.html">Politique de confidentialité</a><a href="#" data-manage-cookies>Gérer mes cookies</a>';f.append(nav);}});
document.querySelectorAll('nav').forEach(nav=>{if(nav.getAttribute('aria-label')==='Navigation principale'||nav.classList.contains('nav-links')||nav.classList.contains('navlinks')||nav.classList.contains('back-nav')){if(!nav.querySelector('a[href="a-propos.html"]')){const a=document.createElement('a');a.href='a-propos.html';a.textContent='À propos';nav.append(a);}}});
})();