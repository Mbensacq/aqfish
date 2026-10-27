# 0060 — Tableau de bord : santé, simulation et alertes avec cause et action

- Statut : acceptée
- Date : 2026-10-27
- Auteur : Dev, cycle 81, issue #260

## Contexte

Lot 2/3 de #251 (idée de Mathis), après le cadre et les jauges d'eau (ADR 0059). Le cadre
doit aussi montrer en continu la santé des animaux et l'état de la simulation, et des
alertes compréhensibles qui disent **quoi faire**. La santé et la faim existent déjà
(`sim/wellbeing.ts`, ADR 0054), comme les seuils de l'eau (ADR 0053) et les zones du pH
(ADR 0057) : à réutiliser, pas à dupliquer. Contraintes héritées de l'ADR 0059 : centre du
bac (60 % × 60 %) dégagé à 390, 768 et 1280 px, rafraîchissement au plus 4 fois par seconde,
aucune écriture dans la simulation, captures sans interface inchangées.

Place mesurée sous le cadre haut : 65 px sur bureau (1280 × 720), 82 px sur tablette,
25 px seulement sur téléphone (390 × 844). Au-dessus de la barre des vues : 88 px sur
bureau, 149 px sur tablette, 79 px sur téléphone.

## Décision

- **Synthèse de santé** (`sim/health-summary.ts`, pur) : nombre d'animaux, santé moyenne,
  faim moyenne, malades (santé ≤ 0,8), faibles (santé ≤ 0,4), affamés (faim maximale),
  en détresse (faibles ou affamés, comptés une fois). Seuils compris, valeurs de jeu.
  Lecture alignée sur `sim/wellbeing.ts` : santé non finie comptée pleine, faim non finie
  comptée nulle, valeurs bornées ; la faim ne compte que pour les espèces nourries aux
  granulés (`feedsOnPellets`), les autres ne peuvent pas être nourries. Moyennes arrondies
  au milliardième (une somme de flottants égaux ne franchit pas un seuil par erreur).
- **Alertes** (`sim/dashboard-alerts.ts`, pur) : `{ id, gravité, message, cause, action }`.
  - **Seuils** : ceux des jauges, sans seuil nouveau pour l'eau. Jauge orange → alerte
    « attention », jauge rouge → « critique », verte → rien. Température : écart à celle de
    l'environnement (trop chaude ou trop froide, action « Régler le chauffage sur 25 °C ») ;
    pH : zone tolérée → attention, hors plage → critique, du côté acide ou basique ; espèces
    sans plage commune → critique « pH impossible à tenir ». Faim : un affamé → critique,
    faim moyenne ≥ 0,7 → attention. Santé : un faible → critique (« Animaux en détresse »),
    un malade → attention ; la cause cite les autres alertes critiques qui usent la santé
    (eau mauvaise, faim, pH hors plage), sinon « gêne passée, santé encore basse ».
  - **Valeur non finie** : alerte critique, cause « mesure invalide » (jamais rassurante,
    comme `levelOf`).
  - **Une alerte par sujet** (identifiant unique) : pas de doublon.
  - **Ordre** : critiques d'abord ; à gravité égale, ordre fixe ammoniaque, nitrites,
    température, pH, faim, nitrates, santé (les causes dans l'eau avant leurs conséquences ;
    les nitrates, lents, après la faim, plus urgente). Même entrée, même liste.
  - **Textes de jeu** : causes et actions décrivent le modèle simplifié de la simulation
    (`sim/water.ts`), pas une règle d'aquariophilie ; aucune valeur biologique n'y est citée.
- **Anti-bruit** : une alerte ne change qu'avec le niveau d'une jauge, lui-même calculé au
  plus 4 fois par seconde. La région `role="status"` annonce les sujets et gravités de toutes
  les alertes, **sans valeur ni effectif** : son texte ne change (et n'est relu) que lorsqu'une
  alerte apparaît, disparaît ou change de gravité. L'hôte ne remplace la synthèse de santé que
  si ce qu'elle affiche change (pour cent près, effectifs : `sameHealthSummary`).
- **Disposition** :
  - simulation (icône du moment de la journée de `ui/day-indicator`, heure, vitesse) à droite
    des jauges dans le **cadre haut** ; sur téléphone, sur la ligne du bouton « Eau » ;
  - santé et alertes dans un **bandeau bas** (`ui/dashboard-frame/dashboard-status`,
    composant frère du cadre dans `app.html`, mêmes couleurs et même estompage), juste
    au-dessus de la barre des vues : il n'y a pas la place sous le cadre haut sur téléphone, et
    le bandeau bas garde la même place à toutes les largeurs. Bas du bandeau à 64 px du bord
    (96 px sous 640 px, où la barre des vues passe sur deux lignes). Mesuré avec trois alertes :
    haut du bandeau à 603 px sur bureau (centre jusqu'à 576), 907 px sur tablette (819),
    686 px sur téléphone (675).
  - **Au plus trois alertes** affichées, puis « +N ». Chaque alerte est un bouton (icône de
    niveau, gravité en texte, message) qui se déplie, une à la fois, sur une ligne « Cause
    probable : … À faire : … » (`aria-expanded`, `aria-controls` vers le détail ouvert).
- **Rythme** : la synthèse de santé est relevée avec l'eau (`exposeWater`, donc au plus 4 fois
  par seconde, et aux changements de population) ; les alertes sont dérivées par le bandeau
  (`computed`) des relevés reçus (eau exacte, zones du pH, santé). Aucune écriture dans le monde.

## Options écartées

- **Seuils propres aux alertes** (plus tôt que les jauges) : une alerte sans jauge orange
  contredirait l'affichage ; les seuils restent ceux de l'ADR 0053.
- **Hystérésis** (seuil de retour plus bas) : les grandeurs du modèle varient lentement et
  dans un seul sens entre deux actions (nitrates en hausse, ammoniaque en baisse) ; l'annonce
  sans valeur suffit à éviter les répétitions. À revoir si une grandeur oscille autour d'un
  seuil.
- **Santé sous le cadre haut** : 25 px de place sur téléphone ; et sur tablette, l'aide-mémoire
  déplié par défaut aurait dû descendre encore.
- **Effectifs dans le message** (« 3 animaux affamés ») : le texte annoncé changerait à
  chaque animal ; l'effectif est dans la cause (détail déplié) et dans la ligne de santé.

## Conséquences

- Un détail d'alerte déplié agrandit le bandeau vers le haut et peut mordre sur le centre du
  bac sur bureau (une ligne de plus) : c'est une ouverture à la demande, comme un panneau.
- Le lot 3/3 (lien avec les animaux) peut s'appuyer sur `HealthSummary` et sur les
  identifiants d'alerte (`health`, `hunger`) pour désigner les animaux concernés.
- Captures d'interface : les variantes `-alerte` importent un bac à cinq alertes (ammoniaque,
  nitrites, nitrates, animaux affamés) ; ajout de `tablette-tableau-de-bord-alerte`.
