# MindFlow — Plan de recette de la bibliothèque numérique

Ce document accompagne la branche `feature/bibliotheque-numerique`. La migration et la fonction Edge ne sont pas déployées par ce commit. Ne pas lancer les essais utilisateurs avant le déploiement coordonné des trois éléments : migration SQL, fonction Edge, pages web.

## Ordre de mise en service pour les tests

1. Vérifier que le bucket `mindflow-products` reste privé et conserve sa limite de 100 Mo. La migration ajoute uniquement le MIME EPUB à la liste autorisée.
2. Appliquer la migration `20261101000000_mindflow_digital_library.sql`.
3. Déployer la fonction Edge `mindflow-library` avec les secrets Supabase standards déjà configurés. Conserver la vérification JWT activée.
4. Publier les pages de la branche sur un environnement de test ou après validation sur le site.
5. Se connecter avec le compte bibliothèque autorisé et terminer l’authentification MFA au niveau `aal2`.

## Scénarios administrateur

- [ ] Un compte non connecté est redirigé vers la connexion.
- [ ] Un compte connecté sans entrée active dans `library_admins` reçoit un refus d’accès.
- [ ] Un compte autorisé sans MFA `aal2` ne peut pas appeler les actions admin de la fonction Edge.
- [ ] Le compte autorisé avec MFA `aal2` ouvre l’administration.
- [ ] La liste des produits actifs s’affiche dans le champ de liaison produit.
- [ ] Création d’un ouvrage en brouillon, puis modification de ses métadonnées.
- [ ] Association à une ou plusieurs collections éditoriales.
- [ ] Ajout et modification d’un auteur / partenaire.
- [ ] Activation d’un droit domaine public sans justificatif : refus attendu.
- [ ] Activation d’un droit contractuel sans ayant droit ou référence de contrat : refus attendu.
- [ ] Activation des droits avec justificatif, partenaire et référence : succès attendu.
- [ ] Téléversement PDF, EPUB et couverture JPG/PNG ; vérifier que les fichiers sont créés sous `library/<id-ouvrage>/...` dans le bucket privé.
- [ ] Tentative d’extension/MIME incohérente : refus attendu.
- [ ] Fichier de plus de 100 Mo : refus côté interface et rejet par Storage.
- [ ] Association d’un fichier déjà présent dans le stockage privé.
- [ ] Modification d’une fiche fichier ; retrait d’une fiche sans suppression physique du fichier.
- [ ] Publication sans licence active ou sans fichier PDF/EPUB autorisé : refus attendu.
- [ ] Publication d’un livre payant sans produit MindFlow ou sans droit de vente : refus attendu.
- [ ] Publication avec droits et fichier valides : succès attendu.
- [ ] Création, modification et suppression d’un quiz depuis l’administration.
- [ ] Passage d’un quiz côté apprenant : choix unique, choix multiples, vrai/faux et réponse courte.
- [ ] Vérifier que les réponses correctes ne sont jamais exposées au navigateur avant correction.
- [ ] Vérifier que le score est calculé côté serveur et qu’un client ne peut pas injecter un score ou une tentative falsifiée.
- [ ] Vérifier l’enregistrement de la tentative et le seuil de réussite.

## Scénarios apprenant et paiement

- [ ] Le catalogue public ne montre que les ouvrages publiés ayant des droits valides et un fichier de lecture autorisé.
- [ ] Les trois collections apparaissent : classiques et domaine public, auteurs locaux et contemporains, lectures scolaires.
- [ ] La recherche, les filtres de collection et le tri fonctionnent.
- [ ] Un ouvrage gratuit peut être lu et ajouté à « Ma bibliothèque ».
- [ ] Un ouvrage payant renvoie vers `paiement.html?id=<product_id>` et le parcours E-Billing existant.
- [ ] Après confirmation réelle du paiement, l’entitlement actif ajoute l’ouvrage à « Ma bibliothèque ».
- [ ] Un achat déjà confirmé avant la publication de l’ouvrage est également synchronisé lors de sa publication.
- [ ] Un compte sans droit d’accès ne peut ni lire ni télécharger le fichier.
- [ ] Après révocation ou suppression du dernier entitlement actif, l’ouvrage disparaît de « Ma bibliothèque » et l’accès est refusé.
- [ ] Si plusieurs entitlements actifs existent pour le même produit, la révocation d’un seul ne retire pas l’accès.
- [ ] Création, modification, publication et suppression des fiches pédagogiques.
- [ ] Consultation des fiches uniquement par un apprenant ayant accès à l’ouvrage.
- [ ] Progression EPUB enregistrée pendant la lecture et affichée dans « Ma bibliothèque ».
- [ ] Vérifier qu’un accès de lecture expiré ou révoqué ne permet plus de consulter le livre, les fiches ni les quiz.
- [ ] Un fichier privé n’est accessible qu’au moyen d’un lien signé temporaire (180 secondes).
- [ ] Un droit expiré ou révoqué bloque l’ouverture et le téléchargement.

## Contrôles de sécurité

- [ ] Aucun secret/service-role key n’est présent dans les pages HTML.
- [ ] Les tables privées partenaires, licences et fichiers ne sont pas lisibles directement par les rôles anon/authenticated.
- [ ] Les réponses correctes des quiz ne sont pas lisibles par le navigateur.
- [ ] Les fichiers restent dans le bucket privé ; aucune URL publique n’est créée.
- [ ] Les actions d’administration vérifient le compte dédié `library_admins` et le claim MFA `aal2` côté serveur.
- [ ] Vérifier les Security Advisors Supabase après application de la migration.

## Limites connues à vérifier pendant la recette

- Les quiz sont créés et publiés depuis l’administration ; l’expérience complète de passage/correction du quiz côté apprenant reste une étape distincte.
- Le retrait d’une fiche fichier ne supprime volontairement pas le binaire du bucket, afin d’éviter une suppression accidentelle.
- Les justificatifs de droits sont des références saisies par l’équipe ; la validation juridique du document reste humaine.
- Le rôle d’administration de la bibliothèque est distinct de l’administration MindFlow Réseau.

## Contrôles automatisés de code

- GitHub Actions exécute `deno check` sur la fonction Edge.
- GitHub Actions vérifie la syntaxe JavaScript inline des pages bibliothèque, apprenant et administration.
- Ces contrôles statiques ne remplacent pas les tests d’intégration après déploiement sur l’environnement de test.
