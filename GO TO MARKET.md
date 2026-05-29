# Plan Go-to-Market — Service clé en main "Tableau de bord opérationnel"

> Objectif : vendre une mission de développement d'un tableau de bord métier sur mesure à des PME grossistes / distributeurs, en s'appuyant sur ce projet de démo comme référence et socle technique.

---

## 1. L'offre — ce que tu vends exactement

### Nom de l'offre (proposition)

**"Pilotez votre activité en temps réel — tableau de bord opérationnel sur mesure, livré en 8 semaines."**

### Ce que le client reçoit

| Livrable | Détail |
|---|---|
| Application web sécurisée | Accessible depuis n'importe quel navigateur, login protégé |
| Dashboard opérationnel | KPIs clés, alertes, résumé du jour |
| Vues métier sur mesure | Clients, ventes, stocks, géographie, saisonnalité — selon ses besoins |
| Pipeline de données automatisé | Rafraîchissement quotidien sans intervention humaine |
| Infrastructure cloud hébergée | GCP (Cloud Run + BigQuery) — pas de serveur à gérer |
| CI/CD opérationnel | Mises à jour sans interruption de service |
| Formation + documentation | 2 jours d'accompagnement utilisateur inclus |
| 3 mois de support | Corrections de bugs + évolutions mineures |

### Ce que tu ne vends PAS (dans l'offre de base)

- Intégration ERP en temps réel (flux webhook) — option
- Application mobile — option
- Formation technique (admin système) — option
- Hébergement on-premise — hors périmètre

---

## 2. Clients cibles — qui appeler en premier

### Cible primaire (le plus facile à closer)

**PME grossistes / distributeurs avec logiciel EBP** (vêtements, équipement, alimentaire, cosmétique)

- CA entre 5 M€ et 50 M€
- 2 à 10 boutiques / dépôts / entrepôts
- Utilisent EBP Gestion Commerciale ou EBP Commerce
- Leur reporting actuel = fichiers Excel envoyés par email

**Pourquoi c'est la cible idéale :**
- EBP expose une API REST (non encore intégrée) — potentiel de synchronisation temps réel à valoriser
- En attendant l'intégration API, le client dépose ses exports CSV sur GCS via un script simple à installer — friction faible
- Le problème est identique chez tous (données fragmentées, pas de vue consolidée)
- Decision-maker = dirigeant ou DAF — cycle de vente court (pas de DSI)

### Cible secondaire

**Réseaux de franchises / groupements d'indépendants** (GSS, coiffure, restauration rapide)

- Problème similaire : agréger les données de plusieurs points de vente hétérogènes
- Budget souvent plus élevé (réseau = plusieurs utilisateurs)
- Adaptation nécessaire pour d'autres sources que EBP

### Cible tertiaire (plus longue à closer, mais meilleure marge)

**Distributeurs régionaux** (agroalimentaire, pièces auto, BTP) avec équipe commerciale terrain

- Valeur ajoutée forte sur le module prospection (SIRENE)
- Budget plus élevé : 60 000 – 120 000 €
- Cycle de vente plus long (3-6 mois)

---

## 3. La proposition de valeur — ce qui convainc

### Problème que tu résous (en langage client, pas en langage tech)

> "Vous avez les données dans votre logiciel, mais pour avoir un vrai bilan vous devez attendre la fin du mois — ou passer 2h à copier-coller dans Excel. Vous ne savez pas en temps réel quels clients sont en train de décrocher, quels articles ne se vendent plus, ou quels dépôts sont en rupture. Résultat : vous pilotez à l'aveugle."

### Ce que tu apportes

1. **Visibilité instantanée** — les chiffres du jour disponibles chaque matin sans intervention
2. **Alertes proactives** — le dashboard vous prévient avant que le problème devienne coûteux (client qui décroche, stock critique)
3. **Une seule source de vérité** — toutes vos boutiques consolidées, plus de dispute entre les chiffres
4. **Aucune compétence technique requise** — vous vous connectez, vous lisez, vous décidez

### Les 3 arguments qui closent

| Argument | Ce que tu dis |
|---|---|
| **Vitesse** | "Livré en 8 semaines, vous êtes opérationnel avant la fin du trimestre." |
| **Retour sur investissement** | "Un seul client réactivé grâce aux alertes churn couvre plusieurs mois d'abonnement." |
| **Clé en main** | "Vous n'avez rien à installer, rien à maintenir. Je m'occupe de tout, de la donnée à l'écran." |

---

## 4. Le modèle commercial — comment tu te fais payer

### Option A — Mission forfaitaire + maintenance (recommandé pour démarrer)

| Phase | Durée | Prix |
|---|---|---|
| Projet (développement + livraison) | 8 semaines | **45 000 – 65 000 € HT** |
| Maintenance annuelle (support + hébergement + évolutions mineures) | 12 mois | **8 000 – 12 000 € HT/an** |

**Avantage :** revenu prévisible, relation longue durée, upsell facile sur les évolutions.

### Option B — Abonnement mensuel tout inclus (SaaS déguisé)

| Formule | Contenu | Prix |
|---|---|---|
| Starter | Dashboard de base (5 vues), 1 boutique | **1 200 €/mois** |
| Business | Dashboard complet, 4 boutiques, prospection | **2 500 €/mois** |
| Enterprise | Sur mesure, multi-sites, intégrations | Sur devis |

**Avantage :** pas de gros ticket à défendre en comité, engagement plus facile.
**Inconvénient :** il faut ~10 clients pour que ça devienne rentable.

### Recommandation pour démarrer

Commence avec **Option A** (mission + maintenance). Un seul client à 55 000 € + 10 000 €/an = 65 000 € la première année. Tu construis ta référence, tu perfectionnes le process, puis tu bascules en abonnement à partir du 3e ou 4e client.

---

## 5. Ce qui manque aujourd'hui pour vendre — checklist

### Indispensable avant le premier rendez-vous

- [ ] **Une démo en ligne** — instance de démo avec données fictives réalistes. URL publique, sans login ou avec login partageable. C'est le point de blocage n°1.
- [ ] **Un one-pager PDF** (1 recto-verso) — problème / solution / ce que tu livres / prix indicatif / tes coordonnées. Pas de jargon tech.
- [ ] **Un site vitrine minimaliste** (ou page LinkedIn soignée) — preuve d'existence professionnelle. 3 sections : ce que tu fais, pour qui, comment me contacter.
- [ ] **Un case study de référence** (anonymisé) — "J'ai livré ce tableau de bord pour un grossiste textile 4 boutiques en X semaines. Voici ce que ça a résolu."

### Important pour closer (avant la signature)

- [ ] **Un deck de présentation** (8-10 slides) — voir structure section 6
- [ ] **Un modèle de devis / proposition commerciale** — structuré, professionnel, avec phases et livrables clairs
- [ ] **Un contrat type** (conditions générales de prestation + annexe données) — indispensable côté RGPD (tu touches des données clients de leur EBP)
- [ ] **Témoignage ou validation du client de référence** — même une phrase signée vaut de l'or

### Pour passer à l'échelle (3e client et au-delà)

- [ ] **Connecteur EBP générique** — script d'import paramétrable (nom des colonnes, encodage, séparateur) plutôt que hard-codé
- [ ] **Template de projet réutilisable** — repo "starter" avec la structure Terraform + dbt vide, à dupliquer pour chaque client
- [ ] **Checklist d'onboarding client** — ce qu'il doit te fournir (accès EBP, exports CSV, contacts IT) pour démarrer le jour 1
- [ ] **Grille de découverte** — liste de questions à poser au premier RDV pour caler le scope en 45 minutes

---

## 6. Le deck de présentation — structure des 10 slides

| Slide | Titre | Contenu |
|---|---|---|
| 1 | Accroche | "Vous pilotez votre activité à l'aveugle. Je vais changer ça." |
| 2 | Le problème | 3 douleurs concrètes (Excel, données fragmentées, alertes tardives) — avec chiffres si possible |
| 3 | La solution | Une phrase + capture d'écran du dashboard (la plus belle vue) |
| 4 | Ce que vous obtenez | Liste des vues livrées — en langage métier, pas tech |
| 5 | Comment ça marche | Schéma simplifié : vos données → pipeline → dashboard. 3 étapes maximum |
| 6 | La démo | Capture vidéo de 60s ou lien démo live — c'est la slide qui fait basculer |
| 7 | Ce que ça coûte | Fourchette de prix claire + comparaison "vs recruter un analyste à 40k€/an" |
| 8 | Le planning | Timeline 8 semaines avec jalons (semaine 1 : data, semaine 3 : beta, semaine 6 : recette…) |
| 9 | Qui je suis | Photo, 3 lignes de profil, logos des technos que tu maîtrises, référence projet de démo |
| 10 | Prochaine étape | "Un appel de 30 minutes pour voir si votre situation correspond." + calendly / email |

---

## 7. Le script du premier rendez-vous

### Structure en 45 minutes

```
0-5 min    — Contexte : tu fais quoi, tu sers qui, en une phrase.
5-20 min   — Écoute : "Aujourd'hui, comment vous produisez vos reportings ?"
             "Qui les consulte ? À quelle fréquence ?"
             "Qu'est-ce que vous aimeriez savoir que vous ne savez pas aujourd'hui ?"
20-30 min  — Démonstration : démo live sur l'instance de démo.
             Ne montre PAS tout. Montre les 3 vues qui répondent à ce qu'il vient de dire.
30-40 min  — Projection : "Pour vous, ça ressemblerait à ça — vos données, vos boutiques."
             Parle de la timeline (8 semaines) et du prix de façon directe.
40-45 min  — Prochaine étape concrète : "Je vous envoie une proposition d'ici vendredi.
             Vous avez besoin de qui d'autre dans la pièce pour décider ?"
```

### Les questions pièges à éviter de poser

- "C'est quoi votre budget ?" (trop tôt, coupe la conversation)
- "Est-ce que vous connaissez BigQuery ?" (tu perds le client en 3 mots)
- "On pourrait aussi faire une API REST avec…" (hors sujet — parle résultats, pas techno)

---

## 8. Les objections courantes et comment y répondre

| Objection | Réponse |
|---|---|
| "On a déjà des rapports EBP." | "EBP fait de la gestion, pas du pilotage. Est-ce qu'EBP vous dit quels clients sont sur le point de partir ?" |
| "On peut faire ça en interne avec Power BI." | "Power BI nécessite quelqu'un pour le maintenir et le faire évoluer. Là c'est clé en main, je m'en occupe." |
| "C'est trop cher." | "Combien vous coûte une heure de votre DAF à assembler des fichiers Excel ? Sur un an, c'est souvent plus." |
| "On n'est pas prêts techniquement." | "Vous n'avez rien à faire côté technique. Vous exportez vos fichiers EBP comme vous le faites déjà, je m'occupe du reste." |
| "On préfère attendre." | "Chaque mois sans ces données, c'est des décisions prises à l'aveugle. Quel est le risque de ne pas avancer ?" |
| "Qui s'en occupe si vous êtes malade ?" | Anticipe : avoir une documentation technique solide + éventuellement un partenaire backup. |

---

## 9. Canaux d'acquisition — par où trouver les premiers clients

### Court terme (0-3 mois)

1. **Réseau direct** — qui dans ton entourage connaît des dirigeants de PME distribution/grossiste ? Une introduction chaleureuse vaut 10 cold calls.
2. **LinkedIn** — profil optimisé "Consultant data & tableaux de bord pour PME" + posts réguliers montrant des captures du dashboard (données fictives).
3. **Fédérations sectorielles** — FHCM (mode), UFC-Que Choisir (non), fédérations du commerce de gros textile — annuaires de membres = liste de prospects qualifiés.

### Moyen terme (3-6 mois)

4. **Partenariat revendeurs EBP** — les revendeurs EBP (il en existe ~150 en France) ont un catalogue clients tout fait. Proposition : commission de 10-15% sur les missions apportées.
5. **Comptables / experts-comptables** — leur client PME leur demande souvent "comment avoir une meilleure visibilité". Tu proposes une commission d'apport.
6. **Malt / Comet** — marketplace consultants. Mettre en avant "spécialiste tableaux de bord PME distribution EBP" dans le profil.

### Long terme (6 mois+)

7. **SEO / contenu** — article "Comment avoir un tableau de bord de pilotage avec EBP sans recruter un data analyst" → attire les dirigeants qui cherchent activement.
8. **Cas client publié** — avec accord du client de référence, un case study détaillé sur LinkedIn + site = meilleur outil commercial qui soit.

---

## 10. Timeline réaliste — de zéro à premier client signé

| Semaine | Action |
|---|---|
| S1-S2 | Créer l'instance de démo (données fictives réalistes) |
| S1-S2 | Rédiger le one-pager PDF |
| S3 | Créer ou optimiser le profil LinkedIn |
| S3-S4 | Construire le deck de présentation (10 slides) |
| S4 | Préparer le modèle de devis + contrat type |
| S5 | Lancer la prospection : réseau direct + 20 messages LinkedIn ciblés |
| S6-S8 | Premiers RDV de découverte |
| S9-S12 | Envoyer les propositions commerciales |
| S10-S14 | **Premier client signé** (objectif réaliste) |

---

## 11. Indicateurs pour savoir si ça marche

| Indicateur | Cible à 3 mois |
|---|---|
| RDV de découverte tenus | 5+ |
| Propositions envoyées | 3+ |
| Taux de conversion RDV → proposition | > 50% |
| Client signé | 1 |
| Montant premier contrat | > 40 000 € HT |

---

## 12. Le piège principal à éviter

**Ne pas sur-customiser avant d'avoir signé.**

La tentation est de construire l'intégration API EBP native, des connecteurs Sage, Cegid, Odoo "pour avoir un marché plus large". C'est une erreur classique. La niche EBP grossiste est claire et se vend mieux qu'une offre généraliste.

Pour l'instant, le flux retenu est simple : le client dépose ses exports CSV EBP sur GCS via un script léger. Ça marche. L'API EBP est une évolution à vendre comme option premium une fois les premiers clients signés.

Signe 2-3 clients EBP grossistes. Ensuite, si un prospect arrive avec Sage, tu adapteras. Pas avant.

---

*Document de travail — à réviser après le premier RDV client.*
