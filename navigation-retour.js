/* MindFlow — navigation retour cohérente sur toutes les pages */
(() => {
  "use strict";
  if (window.__mindflowBackReady) return;
  window.__mindflowBackReady = true;
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const fallback = {
    "produit.html":"catalogue.html",
    "acces-gratuit.html":"catalogue.html",
    "paiement.html":"catalogue.html",
    "confirmation.html":"espace-apprenant.html",
    "integration-classes.html":"espace-apprenant.html",
    "commentaires.html":"espace-apprenant.html",
    "mot-de-passe-oublie.html":"index.html",
    "demande-professionnelle-recue.html":"index.html",
    "paiement-professionnel.html":"espace-professionnel.html",
    "tableau-de-bord-professionnel.html":"espace-professionnel.html",
    "verification-professionnels.html":"index.html",
    "profil-professionnel.html":"espace-apprenant.html",
    "politique-confidentialite.html":"index.html",
    "a-propos.html":"index.html",
    "assistant-pedagogique.html":"espace-apprenant.html"
  };
  const sameSiteReferrer = (() => {
    try { return !!document.referrer && new URL(document.referrer).origin === location.origin; }
    catch (_) { return false; }
  })();
  if (file === "index.html" && !sameSiteReferrer) return;
  const style = document.createElement("style");
  style.textContent = `
    #mindflow-back-button{position:fixed;z-index:9997;top:calc(env(safe-area-inset-top,0px) + 82px);left:14px;display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid #8feee477;border-radius:999px;background:rgba(22,31,53,.94);color:#f4fbff;font-family:inherit;font-size:13px;font-weight:600;line-height:1.2;letter-spacing:.01em;text-decoration:none;box-shadow:0 7px 24px #0005;backdrop-filter:blur(12px);cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease}
    #mindflow-back-button:hover{transform:translateX(-2px);background:rgba(37,54,79,.98);border-color:#8ff8e9}
    #mindflow-back-button:focus-visible{outline:3px solid #9af6e8;outline-offset:3px}
    #mindflow-back-button .mf-arrow{font-size:18px;line-height:12px}
    @media(max-width:600px){#mindflow-back-button{top:calc(env(safe-area-inset-top,0px) + 76px);left:10px;padding:8px 11px;font-size:12px}}
    @media(prefers-reduced-motion:reduce){#mindflow-back-button{transition:none}}
  `;
  document.head.appendChild(style);
  const button = document.createElement("button");
  button.type = "button";
  button.id = "mindflow-back-button";
  button.setAttribute("aria-label","Revenir à la page précédente");
  button.innerHTML = '<span class="mf-arrow" aria-hidden="true">←</span><span>Retour</span>';
  button.addEventListener("click", () => {
    if (sameSiteReferrer && history.length > 1) {
      history.back();
      return;
    }
    const destination = fallback[file] || "index.html";
    if (destination !== file) location.href = destination;
    else if (history.length > 1) history.back();
  });
  document.body.appendChild(button);
})();
