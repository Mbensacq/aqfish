# 0144 — Bruitages de la séance d'entretien : paramètres purs, joués par le moteur du fond sonore

- Statut : acceptée (complète les ADR 0100 et 0138)
- Date : 2026-11-15
- Auteur : Dev, cycle 226, issue #625

## Contexte

Lot 7 de l'épopée « Entretenir à la main » (#593) : les gestes de la séance guidée (ADR 0138)
sont muets. Le fond sonore (ADR 0100) existe déjà : synthétisé par Web Audio, coupé par
défaut, contexte créé seulement au geste de l'utilisateur, interdit en capture. Aucun fichier
audio ne doit être ajouté et le déterminisme de la simulation ne doit pas bouger.

## Décision

1. **Paramètres purs** dans `core/care-sound/care-sound.ts` : une table `CARE_SOUNDS`
   (raclette, siphon, seau, clic) donnant durée, attaque, hauteurs de départ et d'arrivée,
   part de bruit, filtre et niveau ; `careSoundSpec(kind, jitter)` décale les hauteurs d'au
   plus ± 6 % selon un tirage du générateur propre aux bruitages (`CARE_SOUND_SEED`, jamais
   celui du monde) ; `careSoundLevel(spec, enabled, volume)` vaut 0 sauf réglage `true`, puis
   suit le volume existant (`clampVolume`) ; `careSoundDue` espace deux bruitages de même
   nature (un geste continu émet beaucoup d'événements) ; `careStepSound(step, outcome,
   present)` donne le clic d'une étape faite, rien pour une étape sautée, absente ou le bilan.
2. **Lecture** : `AmbientSoundEngine.playCareSound(spec, level)` branche, sur le gain général
   (donc le limiteur), un bruit filtré (tampon du fond sonore) et une sinusoïde glissante sous
   une même enveloppe brève ; les nœuds se débranchent à la fin. `AmbientSoundState.playCareSound`
   ne crée **jamais** de contexte : sans moteur en marche (son coupé, Web Audio absent, pas
   encore de geste, capture), onglet masqué ou volume nul, rien n'est créé.
3. **Déclencheurs** (hôte) : raclette quand un passage retire une plaque, siphon quand un
   passage aspire, seau quand un seau verse vraiment, clic quand une étape se termine.

## Options écartées

- **Second contexte audio dédié aux bruitages** : un contexte de plus à créer au geste et à
  fermer, et un réglage à part ; les bruitages suivent simplement le réglage « Sons ».
- **Échantillons enregistrés** : interdits (aucun asset audio), et poids du site en hausse.
- **Bruitages tirés du hasard du monde** : ferait dériver la simulation selon le son.

## Conséquences

- Son coupé (défaut) : aucun nœud audio, rien ne change pour qui n'active pas le son.
- Les captures ne changent pas (le son est interdit en capture, rien n'est affiché).
- Un nouveau bruitage = une ligne dans `CARE_SOUNDS` et un appel de l'hôte.
