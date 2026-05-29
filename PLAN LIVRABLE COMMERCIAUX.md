# Plan de création — Livrables commerciaux "Indispensable avant le premier RDV"

> Ce que je peux construire concrètement, dans quel ordre, et ce dont j'ai besoin de toi.

---

## Vue d'ensemble — 4 livrables, 3 niveaux d'effort

| # | Livrable | Effort | Dépendance de ta part | Ce que je produis |
|---|---|---|---|---|
| 1 | Démo en ligne | ★★★ | Validation des données fictives | App déployée sur GCP avec fausses données réalistes |
| 2 | One-pager PDF | ★ | Ton nom / logo / contact | Fichier HTML → PDF prêt à imprimer |
| 3 | Site vitrine | ★★ | Ton nom, offre, contact | Page HTML statique déployable sur Vercel ou GitHub Pages |
| 4 | Case study | ★ | Ton accord sur le contenu | Document Markdown / PDF partageable |

**Recommandation :** commencer par 2 et 4 (rapide, zéro dépendance externe), puis 1 (le plus impactant).

---

## Livrable 1 — Démo en ligne

### Objectif
Une URL publique que tu peux envoyer par email ou ouvrir en RDV. Le prospect voit le vrai produit, avec des données qui ressemblent aux siennes.

### Approche technique retenue

**"Mode démo" dans FastAPI** — l'API retourne des données JSON pré-générées (fixtures), sans appel BigQuery. Zéro coût GCP côté données, zéro risque de fuite de données client.

```
Navigateur → Next.js (Cloud Run) → FastAPI (mode démo) → JSON fixtures hardcodées
```

L'application déployée est identique à la prod. Seul le backend change : il lit des fichiers JSON au lieu de BigQuery.

### Ce que je vais créer

**Étape 1 — Générateur de données fictives** (`demo/generate_fixtures.py`)
- Entreprise fictive : "ATELIERS DU SUD" — grossiste vêtements, 3 boutiques (PARIS, LYON, BORDEAUX)
- ~500 clients fictifs avec noms français réalistes, départements, CA cohérents
- ~1 200 articles (références vêtements avec familles, saisons, prix)
- ~8 000 lignes de ventes sur 24 mois (saisonnalité réaliste : pics été/hiver)
- Stocks par dépôt avec quelques alertes urgence (pour montrer les alertes)
- Clients en churn (20-30 clients sans commande depuis 6+ mois)
- Segments RFM peuplés (Champions, At Risk, Lost, etc.)
- ~2 000 prospects SIRENE dans 3 départements autour de Paris

**Étape 2 — Routes demo dans FastAPI** (`api/routers/demo.py` + flag `DEMO_MODE=true`)
- Quand `DEMO_MODE=true` dans les variables d'env, toutes les routes retournent les fixtures JSON
- Quand `DEMO_MODE=false` (défaut), comportement normal BigQuery
- Zéro modification du code frontend

**Étape 3 — Déploiement instance démo**
- Nouveau service Cloud Run `demo-app` (séparé de la prod)
- Variables d'env : `DEMO_MODE=true`, `SKIP_AUTH_MIDDLEWARE=true` (ou login démo `demo` / `demo2024`)
- URL propre type : `demo.operational-dashboard.app` (si tu as un domaine) ou URL Cloud Run directe

### Ce dont j'ai besoin de toi

- [ ] Valider les noms fictifs de l'entreprise et des boutiques (ou me donner les tiens)
- [ ] Confirmer quelles pages tu veux activer en démo (tout ? ou subset ?)
- [ ] Décider : accès libre ou login `demo` / `demo2024` ?
- [ ] Accès au projet GCP pour déployer le service démo (ou je prépare juste le code)

### Durée estimée
2-3 sessions de travail : génération des données → intégration mode démo → déploiement.

---

## Livrable 2 — One-pager PDF

### Objectif
Un document A4 recto-verso (ou recto seul) que tu envoies en pièce jointe ou imprimes avant un RDV.

### Approche technique
Fichier HTML + CSS (print-optimized) → tu l'ouvres dans Chrome → Imprimer → "Enregistrer en PDF". Aucun outil externe nécessaire.

### Structure du document

**Recto :**
- Accroche headline (1 phrase)
- Le problème en 3 bullets
- La solution en 3 bullets
- Captures d'écran du dashboard (2 screenshots côte à côte)
- Timeline : 8 semaines, 3 jalons visuels

**Verso :**
- Ce que vous obtenez (liste des vues livrées, en langage métier)
- Comment ça marche (3 étapes : données → pipeline → dashboard)
- Prix indicatif : "À partir de 45 000 € HT — maintenance annuelle 10 000 € HT"
- Ton nom, ton contact, ton site/LinkedIn, logo

### Ce dont j'ai besoin de toi

- [ ] Ton nom complet + nom de ta société (ou nom commercial)
- [ ] Ton email + numéro de téléphone
- [ ] Ton site ou profil LinkedIn
- [ ] Un logo (ou je génère un placeholder)
- [ ] 2-3 captures d'écran du dashboard que tu veux mettre en avant

### Durée estimée
1 session : je produis le HTML, tu ajustes le contenu, tu exportes en PDF.

---

## Livrable 3 — Site vitrine

### Objectif
Une page web professionnelle qui prouve ton existence et explique ton offre. Essentiel quand un prospect te cherche sur Google avant le RDV.

### Approche technique
Page HTML statique (une seule page) — déployable en 5 minutes sur Vercel ou GitHub Pages, zéro coût.

### Structure de la page (landing page 1 page)

```
[Header]   Logo + "Tableau de bord opérationnel pour PME" + CTA "Prendre RDV"

[Hero]     Titre fort + sous-titre + screenshot du dashboard + CTA

[Problème] 3 cards : "Vous exportez des Excel à la main" / "Vous ne savez pas 
           quels clients vont partir" / "Vos boutiques ne parlent pas le même langage"

[Solution] Ce que vous obtenez — 6 bullets avec icônes

[Comment]  Schéma en 3 étapes (vos données → pipeline → votre dashboard)

[Démo]     Bouton "Voir la démo" → URL démo ou vidéo 60s

[Prix]     "À partir de 45 000 € HT" — forfait ou mensuel — sans tableau compliqué

[Référence] Case study de référence en 3 lignes (anonymisé)

[Contact]  Formulaire simple (name + email + message) ou juste ton email + Calendly

[Footer]   Nom + SIRET + mentions légales minimalistes
```

### Ce dont j'ai besoin de toi

- [ ] Nom de domaine (si tu en as un — sinon je prépare pour GitHub Pages)
- [ ] Mêmes infos que le one-pager (nom, contact, logo)
- [ ] Ton accord sur le texte avant mise en ligne

### Durée estimée
1-2 sessions : je crée la page HTML/CSS, tu valides le contenu, tu déploies sur Vercel (5 min).

---

## Livrable 4 — Case study

### Objectif
Un document d'une page qui raconte le projet de référence : problème client → solution livrée → résultat. C'est ta preuve sociale la plus forte.

### Format
Document Markdown (exportable en PDF via Pandoc ou impression navigateur).

### Structure

```
[En-tête]    Logo client (ou placeholder anonymisé) + secteur + taille

[Contexte]   "Notre client, grossiste vêtements avec 4 boutiques, gérait son 
              reporting via des fichiers Excel consolidés manuellement..."

[Le défi]    3 problèmes concrets (en termes business, pas tech)

[Ce qu'on a livré]  Liste des vues + pipeline + infra — avec screenshot

[Résultat]   Ce qui a changé opérationnellement :
             - Temps gagné sur le reporting
             - Première alerte churn détectée
             - Visibilité multi-boutique consolidée
             (Si tu as des chiffres réels, parfait. Sinon je rédige de façon qualitative.)

[Stack]      Ligne technique discrète : Next.js · FastAPI · BigQuery · dbt · GCP

[Citation]   Si tu as un retour du client, même informel, même 1 phrase.

[CTA]        "Votre activité ressemble à ça ? Parlons-en."
```

### Ce dont j'ai besoin de toi

- [ ] Est-ce que tu peux citer le client par son nom, ou il faut anonymiser ?
- [ ] 2-3 résultats concrets observés (même approximatifs)
- [ ] Une citation client, même informelle ? (si oui, je la reformule proprement)
- [ ] Un screenshot du vrai dashboard que tu veux mettre en avant

### Durée estimée
30 minutes : je rédige le document, tu corriges les faits, c'est prêt.

---

## Ordre de travail recommandé

```
Session 1 (aujourd'hui)
├── Livrable 4 — Case study          → 30 min, tu me donnes les faits
└── Livrable 2 — One-pager (draft)   → 45 min, tu me donnes nom/contact

Session 2
└── Livrable 1 — Données fictives    → je génère, tu valides les noms/vues

Session 3
├── Livrable 1 — Mode démo FastAPI   → intégration technique
└── Livrable 3 — Site vitrine        → HTML + structure

Session 4
└── Livrable 1 — Déploiement démo    → Cloud Run, URL publique
```

**Tu peux envoyer ton premier prospect vers le one-pager + case study dès la fin de la session 1.**
La démo peut venir après — elle renforce, elle ne débloque pas.

---

## Pour démarrer maintenant

Dis-moi :

1. **Case study** : je peux citer le client par son nom / j'anonymise en "grossiste textile, 4 boutiques" ?
2. **One-pager** : ton nom complet, nom de société ou marque commerciale, email, téléphone ?
3. **Démo** : nom fictif de l'entreprise démo (je propose "Ateliers du Sud" — ou autre) ?
4. **Site** : tu as un nom de domaine, ou je prépare pour GitHub Pages / Vercel ?
