# 0105 — Partage d'un bac par lien ou par fichier

- Statut : acceptée
- Date : 2026-11-04
- Auteur : Dev, cycle 143, issue #426 (épopée v1.9 « Enrichir et partager »)

## Contexte

L'export et l'import JSON de la pièce existent (#70, ADR 0028 ; schéma 2, ADR 0061 et 0069),
mais il manque un moyen simple de **montrer un aquarium** à quelqu'un, sans serveur (ADR 0004),
sans compte ni télémétrie. L'issue #426 demande un lien qui porte l'état d'un bac, un repli sur
le fichier quand le lien serait trop long, et une validation complète du contenu reçu, qui
peut être hostile (lien fabriqué à la main).

## Décision

1. **Contenu** : la sauvegarde au **schéma 1** du seul bac affiché (`serializeWorld`, sans
   `others`), réglages compris (vitesse, horloge, rendu des granulés, pièce). Le schéma 1 décrit
   exactement un monde et a déjà son validateur complet ; à la lecture, il est migré en pièce
   d'un bac (`migrateSchema1`, ADR 0069). Le nom personnalisé du bac n'est pas transmis (le bac
   reçu porte le nom de son environnement).
2. **Fragment** : `#partage=<version>.<codage>.<données>`.
   - `version` : `1` ; toute autre version est refusée (« mettez l'application à jour »).
   - `codage` : `z` = `deflate-raw` (API `CompressionStream` du navigateur, **aucune nouvelle
     dépendance**), `j` = texte JSON brut, repli quand l'API manque (`compressionSupported`).
   - `données` : base64url sans remplissage (RFC 4648 § 5), écrit et relu en TypeScript pur
     (`sim/share-link.ts`) ; un remplissage non nul ou un caractère hors alphabet est refusé.
   - Le fragment n'est **jamais envoyé au serveur** : rien ne quitte le navigateur tant que
     l'utilisateur ne copie pas le lien.
3. **Longueur maximale** : `MAX_SHARE_LINK_LENGTH` = **32 000 caractères** (adresse complète).
   Mesures (graine 1, 600 pas, lien compressé / brut) : bac tropical par défaut 6 286 / 17 534 ;
   bassin 2 277 / 5 614 ; paludarium 1 275 / 3 411 ; récif 2 357 / 5 674 ; eau froide 1 110 /
   2 313 ; bac tropical plein (60 néons) 12 770 compressé. Au-delà de la limite, aucun lien : le
   message propose le fichier (« Exporter », `shareOutcome` → `fichier`). 32 000 reste sous les
   limites des navigateurs courants ; certaines messageries tronquent les très longs liens : un
   lien tronqué est refusé proprement (point 5).
4. **Import sur confirmation** : ouvrir un lien (ou le coller dans le même onglet,
   `hashchange`) affiche un bandeau « Aquarium partagé : <environnement>, N animaux » avec
   « Importer cet aquarium » / « Ignorer ». Rien n'est remplacé avant l'acceptation ; la
   sauvegarde automatique continue sur le bac en cours. Accepter **remplace la pièce** par le
   bac reçu (le bandeau le dit, avec le nombre de bacs remplacés, et invite à exporter d'abord),
   comme « Importer » ; le fragment est retiré de l'adresse (`history.replaceState`).
5. **Menaces (contenu hostile)** et parades, toutes testées (`share-link.spec.ts`) :

   | Menace                                          | Parade                                                                                                            |
   | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
   | Lien énorme                                     | refus avant décodage au-delà de `MAX_SHARE_LINK_LENGTH`                                                           |
   | Bombe de décompression                          | lecture du flux arrêtée dès `MAX_SAVE_LENGTH` (256 Kio) décompressés                                              |
   | Données tronquées, corrompues, non UTF-8        | refus lisible (`TextDecoder` strict, erreurs du flux interceptées)                                                |
   | Schéma futur, sauvegarde de pièce, `others`     | refus : seul le schéma 1 d'un bac est accepté                                                                     |
   | Valeurs hors bornes, espèce inconnue, effectifs | validateur complet des sauvegardes (`parseSaveWorlds`), puis plafond d'animaux de la pièce (#392)                 |
   | Pollution de prototype                          | propriétés propres seulement (`own`, ADR 0028)                                                                    |
   | Injection dans la page                          | aucun contenu du lien n'est inséré en HTML : textes interpolés par Angular, nom d'environnement relu du catalogue |

   Aucune fonction du partage ne lève : tout refus est un message en français, sans erreur
   console.

6. **Capture** : en mode capture, un fragment `#partage=` valide remplace le monde de l'URL
   (affiché tel quel, sans confirmation ni avance : même graine, même temps) ; invalide, il est
   ignoré. Le test e2e compare la capture `three-quarter` d'un bac partagé à celle du monde
   d'origine, à l'octet.

## Options écartées

- **Bibliothèque de compression** (pako, fflate, lz-string) : `CompressionStream` suffit
  (Chromium 80+, Firefox 113+, Safari 16.4+), avec repli non compressé ; aucune dépendance.
- **Arrondir les nombres pour raccourcir le lien** : l'aller-retour ne serait plus exact
  (déterminisme, ADR 0028) ; refusé.
- **Paramètre de requête (`?`)** : envoyé au serveur et journalisé ; le fragment ne l'est pas.
- **Ajouter le bac reçu à la pièce** au lieu de la remplacer : demande une place libre et une
  taille de bac compatibles avec ses dimensions (lot 2 de la pièce) ; reporté.

## Conséquences

- `sim/share-link.ts` (format, validation, repli), `core/share-codec/share-codec.ts`
  (compression bornée), `ui/share-offer/` (bandeau), bouton « Partager ce bac » et champ du
  lien dans la section « Sauvegarde » du panneau.
- Un bac trop riche pour un lien se partage par le fichier `.json` existant.
- Changer le contenu du lien (schéma 2, plusieurs bacs) demandera une version 2 du fragment ;
  la version 1 restera lue.
