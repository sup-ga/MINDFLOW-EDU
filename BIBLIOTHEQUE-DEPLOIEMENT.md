# Mise en service — Bibliothèque numérique MindFlow

## État de déploiement (1er novembre 2026)

- Migration `mindflow_digital_library` appliquée au projet Supabase actif `vzgmhdxxlgdiimqtincf`.
- Fonction Edge `mindflow-library` déployée et signalée active avec `verify_jwt=false`. Ce réglage est nécessaire au GET public du catalogue ; le code valide les jetons pour les opérations privées et exige le rôle dédié ainsi que MFA `aal2` pour l'administration.
- Bucket `mindflow-products` privé ; les fichiers de livres ne sont pas exposés publiquement.
- Les pages du site sont dans cette branche et seront publiées par GitHub Pages après fusion dans `main` (si la source Pages du dépôt est bien configurée sur `main`).

## Fonctionnalités livrées

- Catalogue public avec trois collections, recherche et filtres.
- « Ma bibliothèque » réservée aux livres, lecteur PDF/EPUB, téléchargement autorisé et suivi de progression EPUB.
- Administration dédiée via `library_admins`, avec vérification MFA `aal2`.
- Gestion des ouvrages, auteurs/partenaires, licences, fichiers, fiches pédagogiques et quiz.
- Téléversement contrôlé dans le bucket privé.
- Contrôle des droits via `learner_entitlements`, liens signés temporaires et révocation des accès.
- Paiement des ouvrages via le parcours existant `paiement.html?id=<product_id>` et E-Billing.

## Vérifications déjà réalisées

- GitHub Actions : succès sur le commit de tête — vérification Deno de la fonction Edge et syntaxe JavaScript des pages.
- Migration : tables, rôle administrateur, déclencheur de synchronisation et bucket privé vérifiés.
- Fonction Edge : déploiement confirmé et état actif dans Supabase.

## Recette fonctionnelle restant à exécuter après publication

1. Ouvrir le catalogue sans session et vérifier son chargement.
2. Se connecter comme apprenant et vérifier « Ma bibliothèque » sans droit d'accès.
3. Depuis l'administration, vérifier l'accès avec le compte autorisé et une session MFA `aal2`.
4. Téléverser un ouvrage de test (PDF et EPUB), sa couverture et ses éléments pédagogiques.
5. Vérifier lecture, téléchargement, progression, quiz et fiches pédagogiques.
6. Vérifier achat E-Billing de bout en bout avec un produit de test, attribution du droit et révocation après retrait du dernier entitlement.
7. Confirmer qu'un apprenant sans droit ne peut ni obtenir de lien signé ni lire/télécharger le fichier.

## Contraintes de sécurité

- Ne jamais rendre public le bucket de livres.
- Ne pas exposer la clé `service_role` au navigateur.
- Ne pas retirer la validation interne des jetons, le rôle `library_admins` ou l'exigence MFA `aal2`.
- Ne pas confondre l'administration de la bibliothèque MindFlow EDU avec celle de MindFlow Réseau.
- Ne pas distribuer d'ouvrages protégés sans autorisation/licence.
