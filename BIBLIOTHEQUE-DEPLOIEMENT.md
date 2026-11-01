# Mise en service contrôlée — Bibliothèque numérique MindFlow

Ce guide est destiné au passage vers un environnement de test puis à la mise en production. À ce stade, la migration et la fonction Edge ne sont volontairement pas déployées sur le projet Supabase actif.

## Éléments à livrer ensemble

- Migration SQL : `supabase/migrations/20261101000000_mindflow_digital_library.sql`
- Fonction Edge : `supabase/functions/mindflow-library/index.ts`
- Pages : `bibliotheque.html`, `ma-bibliotheque.html`, `admin-bibliotheque.html`, ainsi que le lien d’accès conditionnel dans `verification-professionnels.html`.
- Le paiement des ouvrages continue d’utiliser `paiement.html?id=<product_id>` et le parcours E-Billing existant.

## Ordre d’exécution recommandé

1. Faire une sauvegarde de la base avant toute migration.
2. Vérifier le compte `curtislouis93@gmail.com` et lui faire terminer l’enrôlement MFA. Le contrôle d’administration exige `aal2`.
3. Vérifier que le bucket `mindflow-products` est privé et limité à 100 Mo.
4. Appliquer une seule fois la migration SQL. Elle crée les tables de bibliothèque, ses règles RLS, le rôle dédié `library_admins`, les collections initiales et le déclencheur de synchronisation/révocation des droits d’achat.
5. Déployer la fonction `mindflow-library` avec les secrets Supabase standards. **Le paramètre de déploiement `verify_jwt` doit être `false`** : la route GET du catalogue doit rester publique. Toutes les actions POST privées valident elles-mêmes le jeton via Supabase Auth ; les actions admin vérifient en plus le rôle dédié et le claim MFA `aal2`. Ne pas désactiver ces contrôles dans le code.
6. Publier les pages sur l’environnement de test.
7. Exécuter tous les scénarios de `BIBLIOTHEQUE-TESTS.md`, notamment le refus d’accès après révocation d’un entitlement et l’absence d’exposition des réponses correctes des quiz.
8. Vérifier les Security Advisors Supabase et les journaux de la fonction Edge.
9. Après validation seulement, planifier le passage en production.

## Contraintes à préserver

- Ne pas créer de nouveau projet ni de branche Supabase payante pour ce chantier.
- Ne pas modifier le parcours de paiement existant.
- Ne pas rendre public le bucket de livres.
- Ne pas confondre l’administration de la bibliothèque MindFlow EDU avec celle de MindFlow Réseau.
- Ne pas fusionner cette branche dans `main` ni déployer la migration/fonction sans validation explicite de la recette.
