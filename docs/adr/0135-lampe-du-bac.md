# 0135 — Lampe du bac : intensité pure selon l'heure, ajoutée à la lumière du jour

- Statut : acceptée (complète les ADR 0018, 0109 et 0110)
- Date : 2026-11-12
- Auteur : Dev, cycle 205, issue #584

## Contexte

La durée d'éclairage du bac (`WaterState.lighting`, ADR 0109) pilotait déjà les algues, mais
aucune lampe n'existait : l'éclairage de la scène suivait la seule lumière du jour. L'issue
#584 demande une lampe avec une durée réglable de 4 à 14 h et une heure d'allumage, des fondus
à l'allumage et à l'extinction (net sous « Réduire les mouvements »), les plantes ralenties par
un éclairage court, un conseil de 8 à 10 h au tableau de bord, sans nouvel attribut de shader
(#578) et avec le bac par défaut inchangé.

## Décision

1. **Fonction pure** `lampIntensityAt(heure, allumage, durée, fondu)` (`sim/lamp.ts`) : temps
   écoulé depuis l'allumage modulo 24 h (passage de minuit naturel), fondus linéaires de
   `LAMP_FADE_HOURS` (0,5 h) **compris dans la durée**, raccourcis à la moitié de la durée au
   besoin ; fondu nul : changement net.
2. **Réglages dans l'eau**, comme la durée : `WaterState.lampOn` (heure entière 0–23, défaut
   10 h non écrit, sauvegardes inchangées). Le curseur de durée passe à 4–14 h ; la lecture des
   sauvegardes garde 0–24 h (anciennes valeurs relues telles quelles).
3. **Rendu sans shader** : l'hôte ajoute la lampe à la lumière du jour avant `updateLight`
   (`withLampInto` : intensité au moins celle de la lampe, teintes rapprochées du blanc
   d'autant). Lampe éteinte ou plein jour : lumière **identique au bit près** ; avec la plage
   par défaut 10 h–18 h, les captures à midi comme à minuit ne changent pas. La lampe n'existe
   que dans les bacs à algues (tropical, paludarium, eau froide). Le rythme des poissons
   (ADR 0055) reste sur la lumière du jour.
4. **Plantes** : facteur `plantLightFactor(durée) = min(1, durée / 8)` multiplié au facteur du
   sel ; à 8 h et plus, pousse d'avant au bit près.
5. **Tableau de bord** : ligne « Lampe » dans le calendrier d'entretien déplié (pas de bouton de
   plus dans le bandeau, `docs/PIEGES.md`), avec l'avis courte / conseillée / longue et la
   mention « approximation de jeu ».
6. Intensité exposée aux e2e : `data-aqfish-lamp` (au centième).

## Options écartées

- **Uniforme ou attribut de shader dédié à la lampe** : interdit par #578 et inutile, la lumière
  existante suffit.
- **Fondus hors de la durée** (allumage effectif avant l'heure réglée) : la durée affichée ne
  serait plus la durée d'éclairage réelle.
- **Resserrer la lecture des sauvegardes à 4–14 h** : aurait refusé des bacs enregistrés.

## Conséquences

- La nuit, une lampe allumée éclaire le bac comme le jour ; le reste de la scène suit la même
  lumière (approximation acceptée).
- Valeurs (4–14 h, 10 h, demi-heure, 8 h pour les plantes) : approximations de jeu
  (`docs/SOINS.md` § 12).
