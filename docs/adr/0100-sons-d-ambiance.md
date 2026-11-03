# 0100 — Sons d'ambiance optionnels, synthétisés

- Statut : acceptée
- Date : 2026-11-03
- Auteur : Dev, cycle 137, issue #411 (épopée v1.8 « Aquarium vivant et accessible »)

## Contexte

L'aquarium était silencieux. L'issue demande un fond sonore doux (eau, bulles, pluie),
**désactivé par défaut**, sans effet sur la simulation ni sur les captures, sans ressource
audio copiée, sans dépendance ni service. Les navigateurs n'autorisent un `AudioContext`
qu'après un geste de l'utilisateur (politique d'autoplay).

## Décision

1. **Synthèse Web Audio, aucun fichier** (`ui/ambient-sound/ambient-sound-engine.ts`) :
   - **sous l'eau** : bruit blanc de 2 s en boucle, passe-bas à 380 Hz, gain modulé par un
     LFO à 0,13 Hz (profondeur 35 % du niveau) : filtration lente ;
   - **pluie** : le même bruit (lu à un autre endroit), passe-haut à 1 400 Hz ;
   - **bulles** : « blop » sinusoïdaux de 90 ms, fréquence de départ tirée dans
     [320, 720) Hz et montant de × 1,8, attaque de 5 ms ; intervalles tirés d'une loi
     exponentielle (moyenne `1 / rythme`, au moins 120 ms).
     Tous les niveaux changent par fondu court (`setTargetAtTime`, constante 0,15 s).
2. **Logique pure** (`core/ambient-sound`) : table « scène → niveaux », bornes du volume
   (`[0, 1]`, non fini → 30 %), lecture et écriture du choix. Valeurs de jeu, à volume 1 :

   | Environnement                | Eau  | Bulles (gain, par s) |
   | ---------------------------- | ---- | -------------------- |
   | tropical, eau froide, défaut | 0,35 | 0,25 ; 0,3           |
   | bassin                       | 0,20 | 0,20 ; 0,2           |
   | paludarium                   | 0,25 | 0,20 ; 0,2           |
   | récif                        | 0,45 | 0,25 ; 0,3           |
   | avec bulleur (diffuseur)     | idem | 0,40 ; 2,5           |

   Pluie active : 0,6. Nuit : tout × 0,5 (rythme inchangé). Aube, crépuscule, valeur
   inconnue : × 1. Environnement inconnu : défaut. Son coupé (onglet masqué, vitesse 0,
   aucune scène) : silence par fondu, contexte conservé.

3. **Hasard propre au son** : générateur mulberry32 de `core/random` à graine fixe
   (`AMBIENT_SOUND_SEED`), sans lien avec la graine du monde. Le son ne lit que des signaux
   d'affichage de l'hôte (environnement, moment de la journée, pluie, vitesse) et
   l'indicateur `bubbles` de l'environnement ; il n'importe rien de `sim/` dans
   `core/ambient-sound` (test sur la source du module).
4. **Autoplay** : aucun `AudioContext` avant un geste. Cocher la case (le `change` d'un
   clic ou d'une touche est un geste) le crée ; si le choix mémorisé est « actif », il est
   créé au premier `pointerdown` ou `keydown` sur la page. Décocher appelle `close()` ; le
   contexte est recréé au geste suivant. En capture, l'hôte appelle `forbid()` : aucun
   contexte pour la session, quel que soit le choix mémorisé.
5. **Choix mémorisé** sous `aqfish.sons` (`actif:30`, `muet:55`, volume en pour cent),
   hors de la sauvegarde du monde comme ADR 0098. Valeur inconnue, stockage absent ou qui
   lève : pas de choix (désactivé, 30 %) ; écriture refusée : choix valable pour la session.
6. **Interface** : section « Son » juste après « Accessibilité », case et curseur sur une
   même ligne (place de la première colonne à 1280 × 720, ADR 0098 point 2), classes
   existantes du panneau (budget de style). Sans Web Audio, ou si la création du contexte
   échoue, case et curseur sont désactivés et une phrase l'explique.

La « pluie » ne sonne que si la pluie est active : elle n'existe que dans le bassin.

## Options écartées

- **Fichiers audio** (enregistrements, boucles) : ressources à créer ou à licencier,
  poids du paquet, et contrainte du projet (assets générés par le code).
- **Bibliothèque tierce** (Tone.js, Howler.js) : dépendance pour quelques nœuds Web Audio ;
  Howler lit des fichiers, Tone.js pèse plusieurs centaines de kilo-octets.
- **Démarrer au chargement si le choix est « actif »** : refusé par les navigateurs
  (contexte suspendu, avertissement en console) ; le premier geste suffit.
- **Son dans `sim/`** (rythme des bulles réelles du diffuseur) : couplerait le son au monde
  et au hasard de la simulation.

## Conséquences

- La simulation et les captures de scène ne changent pas. Les captures d'interface où le
  panneau « Réglages » est ouvert montrent la nouvelle section.
- Les e2e ne vérifient que l'état (création et fermeture des contextes, case, curseur),
  jamais le signal : Chromium headless n'a pas de périphérique audio.
- Ajouter une couche (par exemple sons d'actions, hors périmètre) passe par la table de
  `core/ambient-sound` et un nœud du moteur, sans toucher à l'hôte.
