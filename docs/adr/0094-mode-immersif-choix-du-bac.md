# 0094 — Mode immersif : choix du bac

- Statut : acceptée
- Date : 2026-11-02
- Auteur : Dev, cycle 128, issue #375

## Contexte

Le mode immersif (ADR 0086, 0087, 0092) montrait un bac unique : bac tropical aux proportions
de l'écran, peuplé des plus petites espèces nageuses **de tout le catalogue**. Par chance, les
trois plus petites sont tropicales ; mais la règle ne tenait pas compte de l'environnement.
L'issue #375 demande un choix du bac dans l'interface minimale, avec une population cohérente,
sans perdre l'étalonnage, la distance de l'œil ni la profondeur, et sans changer les captures.

## Décision

- **Environnements proposés** : `IMMERSIVE_ENVIRONMENTS = ['tropical', 'recif']`
  (`sim/environment.ts`), les bacs vitrés dont les espèces nagent en pleine eau. Le bassin
  (margelle, forme réglable, koïs de 14 cm), le paludarium (berge émergée, espèces
  amphibiennes) et le bac d'eau froide (axolotl marcheur seulement) n'ont aucune espèce
  nageuse à montrer ou un sol qui ne suit pas les dimensions de l'écran.
- **Population** : `smallSwimmers(env)` ne garde que les espèces nageuses qui vivent dans
  l'environnement (`livesIn`), puis les effectifs `[8, 5, 3]` dans l'ordre des tailles. Bac
  tropical : otocinclus, corydoras, rasboras (inchangé) ; récif : 8 poissons-clowns,
  5 chirurgiens. Défaut des fonctions : `tropical`, donc le bac d'ouverture est le même
  qu'avant.
- **Lieu immersif** : `createWorld` accepte `{ environment, dimensions, immersive: true }`
  pour tout environnement de `IMMERSIVE_ENVIRONMENTS` ; hors mode immersif, seul le bac
  tropical se redimensionne toujours (`isTankResizable`). Au récif, coraux et anémones sont
  tirés de la graine dans les dimensions de l'écran, comme pour tout récif.
- **Interface** : groupe de boutons radio « Bac » dans la barre (pas dans « Réglages ») :
  natif, au clavier par les flèches, sans liste déroulante dont l'ouverture ne produit aucun
  événement. Chaque choix relance le délai de masquage (`showUi`) ; toute touche et tout appui
  sur la barre le relançaient déjà.
- **Recréation** : le choix efface la clé de taille, comme la profondeur ; `syncLayout`
  recrée le monde et la vue si les dimensions **ou l'environnement** ont changé. Étalonnage,
  distance de l'œil et profondeur sont des champs du composant, gardés tels quels. Le choix
  n'est pas mémorisé d'une ouverture à l'autre (le bac immersif n'est jamais sauvegardé).

## Options écartées

- **Liste déroulante** (`<select>`) : sur mobile, la liste ouverte ne produit aucun événement
  pendant la lecture ; l'interface pouvait se cacher sous le doigt.
- **Montrer un bac sauvegardé de l'utilisateur** : hors périmètre de l'issue.
- **Mémoriser le choix** (`localStorage`) : rien ne le demande ; à ajouter avec la clé de
  l'étalonnage si besoin.

## Conséquences

- Captures inchangées : le mode immersif n'y figure pas, et le bac tropical d'ouverture a la
  même population, la même graine et les mêmes dimensions.
- Ajouter un environnement immersif = l'ajouter à `IMMERSIVE_ENVIRONMENTS` ; son nom vient de
  `ENVIRONMENTS[id].name`.
