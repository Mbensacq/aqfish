# aqfish en fond d'écran (Wallpaper Engine)

Ce guide explique comment afficher vos bacs aqfish en fond d'écran avec
**Wallpaper Engine** (logiciel Windows). Le fond d'écran n'affiche que l'aquarium : aucun
bouton, aucun panneau ; la caméra tourne lentement autour du bac, sans fin.

> Les étapes propres à Wallpaper Engine n'ont pas encore été essayées dans le logiciel
> lui-même : elles sont marquées **« à vérifier par Mathis »**. Tout le reste est testé dans
> un navigateur.

## 1. Obtenir le dossier du fond d'écran

Le dossier `fond-ecran` contient tout le nécessaire : la page `index.html`, ses fichiers,
une configuration d'exemple et une image d'aperçu.

Pour le produire depuis le code (Node.js 22) :

```bash
cd frontend
npm ci
npm run paquet-fond
```

Le dossier est créé dans `frontend/dist/fond-ecran/`. La commande vérifie elle-même que la
page s'ouvre depuis le disque (`file://`) avec la configuration d'exemple.

Contenu du dossier :

| Fichier | Rôle |
|---|---|
| `index.html` et les fichiers `.js`, `.css` | L'application, avec des chemins relatifs |
| `aqfish-fond.json` | **Votre aquarium** : configuration lue au démarrage |
| `aqfish-fond.js` | Active la vue fond d'écran ; contient aussi une copie de la configuration, utilisée si `aqfish-fond.json` ne peut pas être lu |
| `preview.jpg` | Image d'aperçu |

## 2. Mettre votre propre aquarium

Par défaut, le fond d'écran montre un bac tropical d'exemple. Pour afficher le vôtre :

1. Ouvrez aqfish dans votre navigateur, réglez vos bacs comme vous les aimez.
2. **Conseil : passez le bac en mode décor** (panneau « Réglages », section « Bacs »). En
   mode décor, l'eau, la faim et la santé sont en pause : vos animaux ne souffriront pas
   d'être regardés des heures sans être nourris.
3. Panneau « Réglages », section « Sauvegarde », bouton **« Exporter »** : le navigateur
   télécharge `aqfish-sauvegarde.json`.
4. Renommez ce fichier en **`aqfish-fond.json`** et remplacez celui du dossier `fond-ecran`.

Le fond d'écran choisit sa scène dans cet ordre :

1. `aqfish-fond.json` à côté de `index.html` ;
2. sinon la configuration de `aqfish-fond.js` ;
3. sinon la sauvegarde locale du navigateur (celle de Wallpaper Engine est séparée de celle de
   votre navigateur : en pratique, elle est vide) ;
4. sinon la scène par défaut.

Un fichier invalide est ignoré : le fond d'écran passe au suivant, sans erreur.

`aqfish-fond.json` n'est lu que dans le paquet (page qui charge `aqfish-fond.js`) ou dans une
page ouverte depuis le disque (`file://`). Une page en ligne ouverte avec `?fond=1` ne le
cherche pas (aucune erreur 404 en console) : elle prend la sauvegarde locale, sinon la scène
par défaut.

**Si votre aquarium n'apparaît pas** (le bac d'exemple s'affiche toujours), Wallpaper Engine
n'autorise sans doute pas la lecture de `aqfish-fond.json` (**à vérifier par Mathis**). Dans
ce cas, ouvrez `aqfish-fond.js` dans un éditeur de texte et remplacez tout ce qui suit
`config: ` jusqu'au `};` final par le contenu de votre `aqfish-fond.json` :

```js
window.aqfishFond = { fps: 30, config: { ...contenu de aqfish-fond.json... } };
```

## 3. Importer le dossier dans Wallpaper Engine

**À vérifier par Mathis** (d'après la documentation de Wallpaper Engine, non relue pendant ce
cycle) :

1. Ouvrez Wallpaper Engine, puis **« Wallpaper Editor »** (éditeur de fonds d'écran).
2. Créez un fond d'écran à partir d'un fichier et choisissez le **`index.html`** du dossier
   `fond-ecran` : l'éditeur importe le dossier entier et y crée un `project.json`.
3. Choisissez `preview.jpg` comme image d'aperçu si l'éditeur le demande.
4. Appliquez le fond d'écran.

## 4. Régler les images par seconde

Le fond d'écran dessine **30 images par seconde** par défaut, ce qui suffit pour des
poissons en pixel art et ménage la carte graphique.

- Dans le dossier, ouvrez `aqfish-fond.js` et changez `fps: 30` (de **15** à **60** ; une
  valeur hors de ces bornes est ramenée à la borne).
- Dans un navigateur, ajoutez `fps=` à l'adresse : `index.html?fond=1&fps=20`.
- Wallpaper Engine a aussi son propre limiteur d'images par seconde (réglages de Wallpaper
  Engine) : le plus bas des deux l'emporte (**à vérifier par Mathis**).

Quand la page est masquée (le navigateur ou Wallpaper Engine le signale), le fond d'écran
s'arrête complètement et reprend là où il en était.

## 5. Essayer sans Wallpaper Engine

- Dans aqfish en ligne : ajoutez `?fond=1` à l'adresse ; la scène est alors votre sauvegarde
  locale. Rechargez la page sans `?fond=1` pour retrouver l'interface.
- Le dossier `fond-ecran` : servez-le avec un petit serveur local
  (`npx http-server dist/fond-ecran` depuis `frontend/`), puis ouvrez l'adresse affichée.
  Ouvert directement depuis le disque, Chrome refuse les modules JavaScript de la page sans
  l'option `--allow-file-access-from-files`.

## Limites connues

- Pas d'interaction : la souris ne tourne pas la caméra et ne nourrit pas les poissons.
- Pas de son.
- Les réglages de Wallpaper Engine propres au fond d'écran (propriétés utilisateur) ne sont
  pas encore utilisés.
