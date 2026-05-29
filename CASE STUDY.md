# Case Study — Tableau de bord opérationnel multi-boutiques

**Secteur :** Commerce de gros — textile & accessoires  
**Taille :** PME, 4 boutiques, 20–50 M€ de CA  
**Durée du projet :** 19 sprints (~6 mois)  
**Stack :** Next.js · FastAPI · BigQuery · dbt · GCP · Terraform

---

## Le contexte

Notre client, grossiste vêtements avec 4 boutiques réparties en France, gérait l'intégralité de son reporting à la main : exports CSV depuis EBP, consolidation dans Excel, envoi par email aux dirigeants. Résultat : un bilan disponible en fin de mois seulement, des chiffres qui divergeaient d'une boutique à l'autre, et aucune visibilité sur ce qui se passait entre deux rapports.

---

## Les 3 problèmes à résoudre

**1. Pilotage à l'aveugle**  
Sans vue consolidée en temps réel, les décisions de réassort, les alertes de stock ou la détection des clients qui décrochent arrivaient trop tard — souvent après que le problème avait coûté de l'argent.

**2. Données fragmentées entre boutiques**  
Chaque boutique avait sa propre version des chiffres. Impossible de comparer les performances ou d'avoir un CA global fiable sans passer des heures à consolider.

**3. Prospection commerciale sans outil**  
L'équipe commerciale identifiait ses prospects au bouche-à-oreille, sans liste structurée ni ciblage géographique.

---

## Ce que nous avons livré

### Application web complète — 14 vues métier

| Vue | Ce qu'elle apporte |
|---|---|
| Dashboard opérationnel | KPIs du jour, alertes critiques, résumé en un coup d'œil |
| Segmentation RFM | Qui sont les Champions, les clients À Risque, les Perdus |
| Alertes churn | Les clients qui décrochent — avant qu'ils partent |
| Carte géographique | CA par département + international — en choroplèthe interactif |
| Performance saisonnière | Best-sellers et flops par saison, comparaison inter-boutiques |
| Stocks par dépôt | Niveaux en temps réel, alertes rupture urgente |
| Fiche client | Historique complet + CA mensuel + top articles achetés |
| Prospection SIRENE | 2,6 Go de données INSEE — prospects NAF 47.71Z dans un rayon paramétrable |

### Pipeline de données automatisé

Les données EBP sont exportées en CSV par le client et déposées sur Google Cloud Storage. Chaque nuit, un pipeline automatique (Cloud Run Job + dbt) charge, transforme et enrichit les données — sans aucune intervention humaine. Le dashboard affiche les chiffres du jour dès le matin.

### Infrastructure cloud entièrement gérée

- **Hébergement :** Google Cloud Run — pas de serveur à maintenir, scale automatique
- **Données :** BigQuery — requêtes rapides même sur des millions de lignes
- **Sécurité :** Login JWT + Identity Token GCP — accès restreint au périmètre client
- **CI/CD :** Cloud Build — mise à jour sans interruption de service sur chaque push

---

## Les résultats

- **Visibilité instantanée :** les chiffres consolidés des 4 boutiques disponibles chaque matin en 1 clic
- **Détection churn opérationnelle :** premiers clients à risque identifiés dès la mise en production
- **Réassort éclairé :** les alertes de stock permettent d'anticiper les ruptures avant qu'elles surviennent
- **Prospection structurée :** liste de prospects qualifiés exportable (nom, adresse, SIRET, forme juridique) filtrée par NAF, département et distance

> *"Pour la première fois, on peut comparer nos 4 boutiques sur un seul écran et réagir le jour même."*  
> — Direction commerciale, client de référence

---

## Ce que ça représente techniquement

- 528 commits · 19 sprints de développement
- 14 pages frontend · 36 composants React · 11 routes API
- 23 modèles dbt (staging + marts)
- Infrastructure as Code complète (Terraform) — redéployable sur un nouveau projet GCP en quelques heures

---

## Votre activité ressemble à ça ?

**Tim LIU — LIU CONSULTING**  
tim.liu.liuconsulting@gmail.com  
[LinkedIn](https://linkedin.com/in/tim-liu-liuconsulting)

*Tableau de bord opérationnel sur mesure — livré en 8 semaines.*
