/* MindFlow — petits guides contextuels pour les apprenants */
(() => {
  "use strict";
  const path = (location.pathname.split("/").pop() || "").toLowerCase();
  const guides = {
    "catalogue.html": {
      title: "Bienvenue dans le catalogue !",
      body: "Ici, tu peux explorer les ressources MindFlow par matière, rechercher un thème et comparer les documents proposés. Ouvre une fiche pour découvrir son contenu, ses aperçus et ses conditions d’accès.",
      tip: "Astuce : utilise les filtres pour trouver plus rapidement ce qui correspond à ton niveau."
    },
    "produit.html": {
      title: "Découvre ta ressource",
      body: "Cette fiche te présente le document : sa description, son contenu et ses aperçus lorsqu’ils sont disponibles. Prends un instant pour vérifier que la ressource correspond bien à ce que tu recherches avant de continuer.",
      tip: "Astuce : consulte les aperçus et les informations de la fiche avant de demander l’accès ou de procéder au paiement."
    },
    "espace-apprenant.html": {
      title: "Ton espace, tout simplement",
      body: "Retrouve ici tes activités MindFlow : tes demandes, tes cours, tes ressources et tes notifications. Les différentes rubriques te permettent de suivre ce qui avance et de retrouver facilement les informations importantes.",
      tip: "Astuce : consulte régulièrement tes notifications pour ne manquer aucune réponse ou mise à jour."
    },
    "acces-gratuit.html": {
      title: "Obtenir une ressource gratuite",
      body: "Cette étape te permet de récupérer gratuitement la ressource choisie. Connecte-toi à ton compte ou crée-en un si tu n’en as pas encore. Une fois connecté, le téléchargement pourra démarrer automatiquement.",
      tip: "Astuce : utilise toujours le même compte MindFlow pour retrouver tes ressources au même endroit."
    }
  };
  const guide = guides[path];
  if (!guide || document.getElementById("mf-guide")) return;
  const key = "mindflow-guide-dismissed:" + path;
  const style = document.createElement("style");
  style.textContent = `
    #mf-guide{position:fixed;right:18px;bottom:18px;z-index:9998;font-family:inherit;color:#f5f6ff}
    #mf-guide .mf-help{display:flex;align-items:center;gap:9px;border:1px solid #8deee477;border-radius:999px;padding:10px 15px;background:linear-gradient(115deg,#193c4a,#30234c);color:#f7ffff;font:600 13px inherit;box-shadow:0 8px 28px #0006;cursor:pointer}
    #mf-guide .mf-help .mf-bulb{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:#d7ff8b;color:#20263c;font-size:16px}
    #mf-guide .mf-card{position:absolute;right:0;bottom:54px;width:min(350px,calc(100vw - 28px));padding:19px 18px 16px;border:1px solid #91eee477;border-radius:18px;background:linear-gradient(145deg,#202d49,#252044);box-shadow:0 18px 55px #0009;animation:mfGuideIn .22s ease-out}
    #mf-guide .mf-card[hidden]{display:none}
    #mf-guide .mf-card h2{margin:0 32px 9px 0;color:#fff;font-size:16px;line-height:1.35}
    #mf-guide .mf-card p{margin:0;color:#dce3f7;font-size:13px;line-height:1.65}
    #mf-guide .mf-card .mf-tip{margin-top:11px;padding-top:10px;border-top:1px solid #ffffff20;color:#a8f5e9;font-size:12px;line-height:1.55}
    #mf-guide .mf-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border:1px solid #ffffff25;border-radius:8px;background:#ffffff12;color:#fff;font-size:18px;cursor:pointer}
    #mf-guide .mf-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    #mf-guide .mf-actions button{border:1px solid #ffffff30;border-radius:10px;padding:8px 11px;background:#ffffff0d;color:#f6f7ff;font:600 12px inherit;cursor:pointer}
    #mf-guide .mf-actions .mf-done{border-color:transparent;background:linear-gradient(105deg,#72f0df,#c4b2ff);color:#172039}
    @keyframes mfGuideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:600px){#mf-guide{right:12px;bottom:12px}#mf-guide .mf-card{right:0;bottom:52px}}
    @media(prefers-reduced-motion:reduce){#mf-guide .mf-card{animation:none}}
  `;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.id = "mf-guide";
  root.innerHTML = `
    <section class="mf-card" id="mf-guide-card" role="dialog" aria-labelledby="mf-guide-title" aria-describedby="mf-guide-body" hidden>
      <button class="mf-close" type="button" aria-label="Fermer le conseil">×</button>
      <h2 id="mf-guide-title">${guide.title}</h2>
      <p id="mf-guide-body">${guide.body}</p>
      <p class="mf-tip">${guide.tip}</p>
      <div class="mf-actions"><button type="button" class="mf-later">Plus tard</button><button type="button" class="mf-done">Je connais déjà</button></div>
    </section>
    <button class="mf-help" type="button" aria-expanded="false" aria-controls="mf-guide-card"><span class="mf-bulb" aria-hidden="true">?</span> À quoi sert cette page ?</button>
  `;
  document.body.appendChild(root);
  const card = root.querySelector(".mf-card");
  const help = root.querySelector(".mf-help");
  const close = () => { card.hidden = true; help.setAttribute("aria-expanded","false"); };
  const open = () => { card.hidden = false; help.setAttribute("aria-expanded","true"); };
  const dismiss = () => { try { localStorage.setItem(key,"1"); } catch (_) {} close(); };
  help.addEventListener("click", () => card.hidden ? open() : close());
  root.querySelector(".mf-close").addEventListener("click", close);
  root.querySelector(".mf-later").addEventListener("click", close);
  root.querySelector(".mf-done").addEventListener("click", dismiss);
  if (card && (() => { try { return localStorage.getItem(key) !== "1"; } catch (_) { return true; } })()) open();
})();
