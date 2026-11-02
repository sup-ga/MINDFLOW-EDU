/* MindFlow — éléments d'interface partagés de la bibliothèque
   Chargé avant le script de chaque page (bibliotheque, ouvrage, ma-bibliotheque). */
(function () {
  "use strict";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const norm = (s) =>
    String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const KINDS = {
    school_reading: "Lecture scolaire",
    literary_work: "Œuvre littéraire",
    textbook: "Manuel",
    educational_resource: "Ressource pédagogique",
    reference: "Ouvrage de référence",
  };
  const kindLabel = (v) => KINDS[v] || "Ressource MindFlow";

  const ACCESS = {
    free: { cls: "free", label: "Gratuit" },
    paid: { cls: "paid", label: "Payant" },
    partner: { cls: "partner", label: "Partenaire" },
  };
  const accessInfo = (b) => ACCESS[b.access_mode] || ACCESS.partner;

  // Une teinte stable par titre : chaque livre sans couverture garde toujours la même.
  function tone(title) {
    let h = 0;
    for (const ch of String(title || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 6;
  }

  /* Couverture d'un livre. La couverture générée est toujours dessous ;
     si l'image est absente ou ne charge pas, elle reste visible. */
  function coverHTML(b, opts) {
    const o = Object.assign({ badge: false, lazy: true, eager: false }, opts || {});
    const art =
      '<div class="cover-art tone-' + tone(b.title) + '">' +
      "<small>MindFlow · " + esc(kindLabel(b.book_type)) + "</small>" +
      "<strong>" + esc(b.title) + "</strong>" +
      "<em>" + esc(b.author_name || "") + "</em></div>";
    const img = b.cover_url
      ? '<img src="' + esc(b.cover_url) + '" alt="Couverture de ' + esc(b.title) + '"' +
        (o.lazy && !o.eager ? ' loading="lazy"' : "") + ' onerror="this.remove()">'
      : "";
    const badge = o.badge ? '<span class="badge ' + accessInfo(b).cls + '">' + accessInfo(b).label + "</span>" : "";
    return '<div class="cover' + (o.badge ? " has-badge" : "") + '">' + art + img + badge + "</div>";
  }

  const plural = (n, one, many) => n + " " + (n > 1 ? many : one);

  window.MFLib = { esc, norm, kindLabel, accessInfo, tone, coverHTML, plural };
})();
