# 0004 — Backend NestJS, introduit en phase 2

- Statut : acceptée
- Date : 2026-10-16
- Auteur : socle (Claude, avec Mathis)

## Contexte

Le premier souhait était Spring Boot. Deux obstacles ont été constatés :

1. Dans l'environnement des agents, Maven Central et le portail Gradle sont bloqués par la
   politique réseau : Spring Boot ne pourrait être ni compilé ni testé par les agents.
2. L'hébergement Infomaniak de Mathis est un hébergement Web mutualisé (PHP, MySQL et
   Node.js d'après la documentation d'Infomaniak) : Java n'y est pas proposé.

Mathis dispose aussi d'un NAS Synology **DS725+** (AMD Ryzen R1600, 2 cœurs, 4 Go de RAM,
DSM 7.3) qui prend en charge Container Manager (Docker).

## Décision

- Front : **Angular** (inchangé).
- Backend : **NestJS** (TypeScript), décidé par Mathis le 2026-10-16. Spring Boot sera
  appris sur un autre projet.
- Le backend n'est **pas** créé en phase 1 : toute la simulation tourne dans le navigateur
  (sauvegarde locale, export et import JSON). Il arrive en phase 2, quand la sauvegarde
  côté serveur, le partage et le catalogue d'espèces en ont besoin. Planif crée alors une
  ADR de mise en place (structure `backend/`, base de données, API, tests, image Docker).
- Hébergement décidé au point d'étape 1 ; candidat principal : conteneur sur le NAS, avec
  une image construite par GitHub Actions et récupérée par le NAS (aucun accès entrant
  depuis la CI, aucun accès des agents au NAS).

## Options écartées

- Spring Boot : non compilable par les agents, non hébergeable sur l'offre actuelle.
- Aucun backend : écarté par défaut, mais reste un repli si la phase 2 prend du retard.

## Conséquences

- Aucun agent ne crée de dossier `backend/` avant la phase 2.
- L'état du monde (JSON sérialisable) est conçu pour être sauvegardé tel quel côté serveur.
- Mémoire du NAS limitée et partagée avec DSM : le backend reste léger (pas de base de
  données lourde sans ADR).
