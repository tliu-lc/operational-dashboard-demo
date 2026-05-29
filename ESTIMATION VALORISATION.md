# Estimation de valorisation — Operational Dashboard Demo

> Document de référence pour estimer le prix de revente de ce projet en état actuel (mai 2026).
> Quatre méthodes sont croisées pour aboutir à une fourchette réaliste.

---

## 1. Ce qui a été livré — inventaire objectif

### Périmètre fonctionnel (14 pages)

| Page | Fonctionnalité |
|---|---|
| `/` | Résumé du jour — KPIs temps réel, alertes critiques |
| `/monitoring` | Dashboard opérationnel — health, alertes, fil quotidien |
| `/articles` | Catalogue articles multi-boutique |
| `/client` | Liste clients, recherche, pagination |
| `/client/[id]` | Fiche client individuelle + historique commandes + CA mensuel |
| `/rfm` | Segmentation RFM (Récence, Fréquence, Montant) |
| `/churn` | Alertes churn — scores + signaux de désengagement |
| `/geo` | Carte France choroplèthe par département + carte internationale |
| `/perf-saison` | Best-sellers et flops par saison + analyse saisonnière |
| `/reassort` | Réassort client |
| `/stock` | Stocks par dépôt + alertes urgence |
| `/paiements` | Suivi paiements |
| `/analyse` | Page analyse |
| `/prospection` | Carte SIRENE NAF 47.71Z + liste prospects + statuts + export CSV + filtres avancés + score prospect + forme juridique |

### Architecture technique

| Composant | Détail |
|---|---|
| **Frontend** | Next.js 15 App Router · TypeScript · Tailwind CSS · Recharts · Plotly · react-simple-maps |
| **Backend** | FastAPI · Python 3.11 · 11 routers (rfm, churn, client, geo, stock, perf_season, monitoring, articles, payments, analyse, prospects) |
| **Base de données** | BigQuery (GCP) · 3 datasets (raw, dwh, dtm) |
| **Transformations** | dbt Core · 23 modèles SQL (7 staging + 16 marts) |
| **Pipeline données** | Python · GCS → BQ raw · 4 boutiques EBP (HIP, SED, HPC, ACC) · import SIRENE NAF 47.71Z |
| **Infrastructure** | Terraform · 12 fichiers IaC · Cloud Run (2 services) · Cloud Run Jobs (2) · Cloud Scheduler · Secret Manager · Artifact Registry · GCS |
| **CI/CD** | Cloud Build · déploiement automatique sur push `main` · 4 images Docker |
| **Auth** | JWT (jose) · bcrypt · middleware Next.js · Identity Token GCP côté API |
| **Thème** | Clair/sombre · thème Linen · sélecteur boutique global (Context React) |

### Métriques de développement

| Métrique | Valeur |
|---|---|
| Commits git | **528** |
| Sprints livrés | **19** (Sprint 01 → Sprint 19) |
| Pages frontend | 14 |
| Composants React | 36 |
| Fichiers Python | 39 (API + pipeline) |
| Modèles dbt | 23 |
| Fichiers Terraform | 12 |

---

## 2. Méthode 1 — Coût au temps passé (TJM consultant)

### Estimation du volume de travail

| Domaine | Estimation | Justification |
|---|---|---|
| Frontend Next.js (14 pages, 36 composants, auth, thème, cartes) | 200h | Pages complexes : geo choroplèthe, RFM, prospection avec carte SIRENE |
| Backend FastAPI (11 routers, auth GCP, BigQuery) | 80h | Auth Identity Token custom, 11 endpoints métier |
| Pipeline dbt (23 modèles staging + marts) | 60h | Modélisation métier complexe : RFM, churn, géo, saisons |
| Infrastructure Terraform + GCP (12 tf, CI/CD, Scheduler) | 50h | Terraform from scratch, Cloud Run, Secrets, IAM |
| Pipeline ingestion Python (GCS → BQ, SIRENE) | 35h | Import CSV EBP multi-boutique + SIRENE NAF national |
| Documentation, spécifications, vault | 30h | Heartbeats agents, sprints, messagerie |
| Tests, recette, refacto (19 sprints) | 55h | Corrections bugs, migrations (Streamlit → Next.js), optimisations |
| **TOTAL** | **510h** | |

### Calcul

| Profil | TJM | Jours (510h ÷ 7,5h) | Montant |
|---|---|---|---|
| Développeur fullstack senior indépendant | 600 €/j | 68 j | **40 800 €** |
| Consultant data/cloud senior | 750 €/j | 68 j | **51 000 €** |
| Agence ou ESN (chefs de projet inclus, marge) | 950 €/j | 68 j | **64 600 €** |

> **Fourchette méthode 1 : 41 000 € – 65 000 €**

---

## 3. Méthode 2 — Prix de marché (devis agence ou DSI)

Sur le marché français, un tableau de bord opérationnel sur mesure de ce niveau pour une PME se facture ainsi :

| Poste | Jours agence | Coût estimé (750 €/j) |
|---|---|---|
| Cadrage & cahier des charges | 5 j | 3 750 € |
| UX / maquettes | 6 j | 4 500 € |
| Modélisation données + dbt | 12 j | 9 000 € |
| Backend FastAPI + BigQuery | 12 j | 9 000 € |
| Frontend Next.js (hors pages complexes) | 18 j | 13 500 € |
| Pages complexes (géo, RFM, prospection SIRENE) | 10 j | 7 500 € |
| Infrastructure GCP + Terraform + CI/CD | 10 j | 7 500 € |
| Authentification + sécurité | 4 j | 3 000 € |
| Tests, recette, corrections | 8 j | 6 000 € |
| Gestion de projet (chef de projet ~15%) | 13 j | 9 750 € |
| **TOTAL** | **98 j** | **73 500 €** |

TVA non incluse. Majoration courante d'une agence parisienne : +20 à +40%.

> **Fourchette méthode 2 : 55 000 € – 90 000 € HT**

---

## 4. Méthode 3 — Valeur client / ROI

Un grossiste vêtements (20-50 M€ de CA, 4 boutiques) qui centralise ses données EBP dans ce dashboard bénéficie de :

| Gain métier | Quantification |
|---|---|
| Temps commercial libéré (moins de requêtes Excel manuelles) | 1-2h/j × 5 personnes = 1 500-3 000 h/an → ~30 000-60 000 € de valeur/an |
| Détection churn précoce (réactivation 1-2 clients/mois) | 1 client réactivé = ~5 000 € CA/an → 5 000-10 000 €/an |
| Réassort optimisé (moins de rupture/surstock) | 0,5-1% de marge sur achats → 50 000-100 000 € selon volumes |
| Prospection SIRENE (nouveaux clients identifiés) | Valeur de contact qualifié B2B : 50-200 €/prospect |

**Retour sur investissement estimé** : le tableau de bord se "rembourse" en **6-12 mois** pour une PME de ce type.

En achat direct, un DSI ou dirigeant rationnel accepte de payer jusqu'à **1 an de gain estimé**, soit :

> **Valeur perçue client : 40 000 € – 70 000 €**

---

## 5. Méthode 4 — Revente comme produit / SaaS

Si le projet est transformé en SaaS multi-tenant pour grossistes vêtements (connecteur EBP générique) :

| Hypothèse | Valeur |
|---|---|
| Marché cible | ~3 000 grossistes textile en France avec EBP |
| Prix SaaS mensuel | 300 – 500 €/mois par client |
| Coût d'adaptation multi-tenant (estimation) | 60 000 – 100 000 € |
| Scénario conservateur (20 clients × 400 €/mois × 36 mois) | **288 000 €** |
| Scénario optimiste (50 clients × 400 €/mois × 36 mois) | **720 000 €** |

> Cette piste est réaliste mais nécessite un investissement complémentaire important (multi-tenant, intégration EBP générique, support, commercial). Le code actuel est un actif solide mais ne vaut pas ce prix en l'état — **il vaut le potentiel, pas la réalité.**

---

## 6. Synthèse — Fourchette de revente réaliste

### Scénario A — Revente du code source "clé en main" (acheteur = entreprise similaire)

| Livrable inclus | Prix |
|---|---|
| Code source + documentation | ~25 000 – 35 000 € |
| + Formation (5 jours d'accompagnement) | +5 000 – 8 000 € |
| + 3 mois de maintenance/support | +5 000 – 8 000 € |
| **Total scénario A** | **35 000 – 51 000 €** |

### Scénario B — Mission de développement sur mesure (client commanditaire)

Ce projet, facturé comme mission de développement pour le grossiste :

| Phase | Montant |
|---|---|
| Développement (phases 1-19) | 45 000 – 60 000 € |
| Maintenance annuelle (SLA) | 8 000 – 15 000 €/an |
| **Total sur 3 ans** | **69 000 – 105 000 €** |

### Scénario C — Acquisition par un éditeur logiciel / concurrent

Un éditeur qui vend des solutions de pilotage aux grossistes textile valoriserait ce projet à :

| Actif | Valeur acquéreur |
|---|---|
| Base de code (18 mois de R&D évitée) | 80 000 – 120 000 € |
| Technologie BigQuery + dbt + CI/CD moderne | +20 000 – 30 000 € |
| Module prospection SIRENE (différenciant) | +15 000 – 25 000 € |
| **Total scénario C** | **115 000 – 175 000 €** |

---

## 7. Verdict — Prix de vente le plus probable

| Contexte de vente | Fourchette |
|---|---|
| Revente directe à un grossiste similaire | **35 000 – 55 000 €** |
| Facturation mission complète au client final | **50 000 – 75 000 €** |
| Acquisition technologique par un éditeur | **100 000 – 175 000 €** |

**Le prix le plus probable pour une revente "classique" (cession de code + accompagnement) se situe entre 40 000 € et 60 000 € HT.**

---

## 8. Ce qui tire le prix vers le haut

- Stack cloud-native moderne (GCP, BigQuery, dbt, Terraform) — reproductible en jours, pas en mois
- Infrastructure as Code complète — déploiement sur un nouveau projet GCP en quelques heures
- CI/CD automatisé (Cloud Build) — zéro friction pour livrer
- Pipeline données robuste (dbt, marts, staging) — base saine pour ajouter des métriques
- Module Prospection SIRENE — différenciant fort, valeur commerciale directe
- Multi-boutique (4 boutiques unifiées) — architecture scalable
- 528 commits / 19 sprints de raffinement — code mature, bugs connus corrigés
- Auth JWT propre + Identity Token GCP — sécurité production-ready

## 9. Ce qui tire le prix vers le bas

- Très spécifique aux exports CSV EBP — pas plug-and-play pour une autre source
- Données client propriétaires (non incluses dans la cession)
- Pas encore déployé en production (branche `develop`) — aucune référence client live
- Nécessite une expertise GCP pour opérer (BigQuery, Cloud Run, dbt)
- Pas de documentation utilisateur (manuel, tutoriels)

---

*Estimation réalisée sur la base de l'analyse du dépôt git (528 commits, 19 sprints, 14 pages, 36 composants, 23 modèles dbt, 12 fichiers Terraform) — mai 2026.*
