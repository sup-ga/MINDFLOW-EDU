# MindFlow — structure de la plateforme

## Pages publiques

- `index.html` : accueil et entrée vers le catalogue.
- `catalogue.html` : liste des produits publiés, recherche, filtre par matière et tri.
- `produit.html?id=<uuid>` : fiche produit, couverture, description et jusqu'à trois aperçus.
- `paiement.html?id=<uuid>` : collecte des coordonnées, création serveur de la commande et de la facture, puis redirection E-Billing.
- `confirmation.html?order_id=<uuid>` : vérifie l'état de la commande dans MindFlow. Une redirection seule ne prouve jamais le paiement.

## Source de vérité

Le projet Supabase actuel est `vzgmhdxxlgdiimqtincf`. Les anciennes références du projet sauvegardé ne sont pas réutilisées.

- `subjects` : matières et sous-matières (110 actives actuellement).
- `products` : catalogue des ressources. Seuls les produits `is_active = true` et `status = 'published'` sont visibles.
- `orders` : coordonnées client, produit, montant fixé côté serveur, état de paiement, référence E-Billing et état de livraison.
- `invoices` : référence de facture émise par E-Billing, reliée à une commande et à son montant. La table n'est accessible qu'au rôle serveur.
- Storage `mindflow-products` : fichiers PDF payants privés. Ne jamais rendre le PDF intégral public ni placer de clé serveur dans le navigateur.

Pour les aperçus, `products.image_url` et `products.preview_images` peuvent contenir des URL publiques d'images ou des chemins relatifs d'images dans le bucket privé `mindflow-products` (par exemple `mathematiques/equations/cover.jpg` et `mathematiques/equations/preview-01.jpg`). La fonction catalogue signe les chemins d'images côté serveur pour une durée limitée. Ne jamais y mettre le chemin du PDF payant intégral.

## Fonctions Supabase déployées

- `mindflow-public-catalog` : renvoie les matières et produits publiés.
- `create-mindflow-order` : valide les coordonnées, relit le produit et son prix dans la base, puis crée la commande côté serveur.
- `create-ebilling-payment` : vérifie à nouveau le montant, demande un jeton OAuth2 Cognito, crée la facture E-Billing et enregistre la référence dans `invoices` et `orders.bill_id`.
- `ebilling-callback` : met à jour la commande après notification E-Billing, sous réserve de la validation du jeton de callback, de la référence, du montant et de la facture.
- `mindflow-order-status` : renvoie l'état après vérification de l'adresse e-mail de la commande.

## Configuration LAB à terminer avant un vrai test de paiement

Configurer les secrets dans Supabase Edge Functions Secrets — jamais dans HTML ou GitHub :

- `EBILLING_CLIENT_ID`
- `EBILLING_CLIENT_SECRET`
- `EBILLING_SUCCESS_URL` — URL publique de `confirmation.html`
- `EBILLING_FAILED_URL` — URL publique de `confirmation.html`
- `EBILLING_API_BASE_URL` — facultatif ; par défaut `https://lab.billing-easy.net`
- `EBILLING_CALLBACK_TOKEN` — secret aléatoire long, utilisé comme paramètre `token` de l'URL du callback enregistrée dans le portail marchand E-Billing.
- `MINDFLOW_MAIL_GATEWAY_URL` — URL HTTPS de la passerelle Apps Script de livraison, terminée par `/exec`.
- `MINDFLOW_MAIL_SECRET` — secret partagé avec cette passerelle.

Demander les scopes OAuth2 PAYIN nécessaires, notamment `ebilling-api/invoice:create` et `ebilling-api/invoice:read`. L'authentification API historique Basic n'est pas utilisée ; le backend utilise le flux OAuth2 Client Credentials de Cognito. Le portail LAB de paiement est `https://test.billing-easy.net`.

## État actuel et limites connues

- Les pages et fonctions sont en place, mais le catalogue Supabase contient actuellement **0 produit** : aucune ressource de démonstration n'est inventée.
- Le flux de paiement ne peut pas être validé de bout en bout avant la configuration des secrets E-Billing et l'enregistrement de l'URL de callback dans le compte marchand.
- Le callback tente la livraison du PDF après paiement confirmé, en générant une URL signée courte depuis le bucket privé. Cette livraison ne fonctionnera qu'après configuration des deux secrets de passerelle ci-dessus et validation de son script Apps Script. Une commande payée ne doit pas être présentée comme livrée tant que `delivery_status` ne le confirme pas.
- Les identifiants/secret E-Billing restent côté serveur. Les clés publiques Supabase ne donnent jamais le droit de marquer une commande payée.
