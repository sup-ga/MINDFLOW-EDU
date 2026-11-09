# Note de reprise — refonte des fiches d’offres MindFlow

## Base et branche
- Base de travail : `main` au commit `d685c3b` (9 novembre 2026).
- Branche : `claude/refonte-fiches-offres`.
- La branche principale n’a pas été modifiée.
- Les changements locaux préexistants décrits dans la session précédente ont été sauvegardés dans le scratchpad de l’environnement de travail précédent ; ils ne sont pas inclus ici.

## Modifications
- `offer-cards.css` : fiches de dimensions cohérentes, photo de couverture 190 px, profil enseignant, matière, tarif et boutons ; largeur adaptée aux écrans étroits et larges ; rangées horizontales avec défilement et snap.
- `offer-cards.js` : rendu commun des offres regroupées par matière, avec bouton de profil et action d’intégration / demande / accès gratuit.
- `integration-classes.html` : utilise le rendu partagé et affiche les statistiques de découverte dans l’en-tête.
- `tableau-de-bord-professionnel.html` : aperçu photo plus robuste ; téléversement tolérant aux métadonnées MIME manquantes sur certains mobiles et erreurs de stockage plus explicites.
- `supabase/migrations/20261109160000_offer_image_storage_permissions.sql` : bucket public `mindflow-avatars` et droit d’envoi limité au dossier `<auth.uid()>/offers/`.

## Vérifications restantes
- La migration de stockage doit être appliquée au projet Supabase avant de conclure le test réel de téléversement.
- Les captures headless 390 px et 1280 px doivent être produites et inspectées via le workflow dédié.
- Vérifier visuellement le profil enseignant et le comportement des rangées sur Android et desktop.
- Ne pas fusionner dans `main` avant validation des captures et du téléversement réel.

## Reprise
Commencer par lire le workflow `.github/workflows/offer-card-screenshots.yml` et ses artefacts, puis vérifier les actions GitHub de la PR. La branche reste isolée de `main`.
