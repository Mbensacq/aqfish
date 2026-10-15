#!/usr/bin/env node
/**
 * Outil d'état partagé de l'équipe aqfish (branche `equipe`, fichier `etat.json`).
 *
 * Usage (depuis n'importe où dans le clone de main) :
 *   node .agents/outils/etat.mjs contexte
 *       Prépare le worktree ../equipe et affiche en JSON : nuit, index, semaine, jour, type,
 *       pause (avec motif), état de la nuit courante, chemin du worktree.
 *   node .agents/outils/etat.mjs phase <role> <statut> [note]
 *       Met à jour la phase <role> de la nuit courante (statut : en-cours | termine | echec | saute).
 *   node .agents/outils/etat.mjs nuit <champ> <valeur-json>
 *       Fixe un champ de la nuit courante : issue, pr, version, metriques, type.
 *   node .agents/outils/etat.mjs global <champ> <valeur-json>
 *       Fixe un champ global : pause, motifPause, experience.
 *   node .agents/outils/etat.mjs publier <message>
 *       Commite et pousse tout ce qui a changé dans le worktree (journal, captures…).
 *
 * Variables d'environnement :
 *   NUIT        force l'identifiant de nuit (AAAA-MM-JJ), sinon date de Paris il y a 12 h
 *   EQUIPE_DIR  chemin du worktree (défaut : <dépôt>/../equipe)
 *
 * Fichier protégé (zone `.agents/**`) : modifications par PR `validation-mathis` uniquement.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLES = ['planif', 'dev', 'qa', 'revue', 'superviseur'];
const STATUTS = ['en-cours', 'termine', 'echec', 'saute'];
const CHAMPS_NUIT = ['issue', 'pr', 'version', 'metriques', 'type'];
const CHAMPS_GLOBAUX = ['pause', 'motifPause', 'experience'];
const TYPES_PAR_JOUR = ['fonctionnalite', 'fonctionnalite', 'fonctionnalite', 'fonctionnalite', 'fonctionnalite', 'dette', 'retro'];
const PROPRIETAIRE = 'Mbensacq';
const ESSAIS_MAX = 4;

const depot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const equipeDir = resolve(process.env.EQUIPE_DIR ?? resolve(depot, '..', 'equipe'));
const etatPath = resolve(equipeDir, 'etat.json');

function git(args, cwd = equipeDir) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (erreur) {
    const detail = String(erreur.stderr ?? erreur.message).trim();
    throw new Error(`git ${args.join(' ')} a échoué : ${detail}`);
  }
}

function echouer(message) {
  console.error(`etat.mjs : ${message}`);
  process.exit(1);
}

function nuitCourante() {
  if (process.env.NUIT) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(process.env.NUIT)) echouer(`NUIT invalide : ${process.env.NUIT}`);
    return process.env.NUIT;
  }
  const ilYa12h = new Date(Date.now() - 12 * 3600 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ilYa12h);
}

function joursEntre(debut, fin) {
  const enUtc = (jour) => {
    const [a, m, j] = jour.split('-').map(Number);
    return Date.UTC(a, m - 1, j);
  };
  return Math.round((enUtc(fin) - enUtc(debut)) / 86_400_000);
}

function maintenant() {
  return new Date().toISOString();
}

function preparerWorktree() {
  if (existsSync(resolve(equipeDir, '.git'))) {
    git(['pull', '--rebase', '--autostash', '--quiet', 'origin', 'equipe']);
    return;
  }
  // Refspec explicite : un clone superficiel (--depth 1) ne suit que la branche par défaut.
  git(['fetch', '--quiet', 'origin', '+refs/heads/equipe:refs/remotes/origin/equipe'], depot);
  git(['worktree', 'prune'], depot);
  git(['worktree', 'add', '--quiet', '-B', 'equipe', equipeDir, 'origin/equipe'], depot);
}

function lireEtat() {
  try {
    return JSON.parse(readFileSync(etatPath, 'utf8'));
  } catch (erreur) {
    echouer(`lecture de ${etatPath} impossible (${erreur.message})`);
  }
}

function ecrireEtat(etat) {
  writeFileSync(etatPath, `${JSON.stringify(etat, null, 2)}\n`);
}

function calendrier(etat, nuit) {
  const premiere = etat.experience?.premiereNuit ?? null;
  if (!premiere) return { index: null, semaine: null, jour: null, type: null };
  const index = joursEntre(premiere, nuit);
  if (index < 0) return { index, semaine: null, jour: null, type: 'avant-experience' };
  const jour = index % 7;
  return { index, semaine: Math.floor(index / 7) + 1, jour, type: TYPES_PAR_JOUR[jour] };
}

function issuesStop() {
  try {
    // API REST uniquement : GraphQL (gh issue list, gh pr …) est indisponible dans les sessions.
    const sortie = execFileSync(
      'gh',
      ['api', `repos/{owner}/{repo}/issues?state=open&labels=stop&creator=${PROPRIETAIRE}&per_page=100`, '--jq', '[.[].number]'],
      { cwd: depot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(sortie || '[]');
  } catch {
    return null; // inconnu : signalé dans le contexte
  }
}

/** Applique une modification à etat.json, commite et pousse, avec relance en cas de course. */
function modifier(message, transformation) {
  for (let essai = 1; essai <= ESSAIS_MAX; essai += 1) {
    git(['pull', '--rebase', '--autostash', '--quiet', 'origin', 'equipe']);
    const etat = lireEtat();
    transformation(etat);
    ecrireEtat(etat);
    git(['add', 'etat.json']);
    if (git(['diff', '--cached', '--name-only']) === '') return etat;
    git(['commit', '--quiet', '-m', message]);
    try {
      git(['push', '--quiet', 'origin', 'equipe']);
      return etat;
    } catch {
      git(['reset', '--soft', 'HEAD~1']);
      git(['restore', '--staged', 'etat.json']);
      git(['checkout', '--', 'etat.json']);
    }
  }
  echouer(`push de etat.json impossible après ${ESSAIS_MAX} essais`);
}

function nuitDans(etat, nuit) {
  etat.nuits ??= {};
  etat.nuits[nuit] ??= { type: calendrier(etat, nuit).type, phases: {} };
  etat.nuits[nuit].phases ??= {};
  return etat.nuits[nuit];
}

function parserJson(valeur) {
  try {
    return JSON.parse(valeur);
  } catch {
    echouer(`valeur JSON invalide : ${valeur}`);
  }
}

const [commande, ...args] = process.argv.slice(2);
const nuit = nuitCourante();

process.on('uncaughtException', (erreur) => echouer(erreur.message));

switch (commande) {
  case 'contexte': {
    preparerWorktree();
    const etat = lireEtat();
    const stop = issuesStop();
    const pause = etat.pause === true || (Array.isArray(stop) && stop.length > 0);
    const motif = etat.pause === true ? etat.motifPause : stop?.length ? `issue(s) stop ouverte(s) : ${stop.join(', ')}` : null;
    console.log(
      JSON.stringify(
        {
          nuit,
          ...calendrier(etat, nuit),
          pause,
          motifPause: motif,
          verificationStop: stop === null ? 'impossible (gh indisponible) : vérifier à la main' : 'ok',
          experience: etat.experience ?? null,
          nuitCourante: etat.nuits?.[nuit] ?? null,
          worktree: equipeDir,
        },
        null,
        2,
      ),
    );
    break;
  }
  case 'phase': {
    const [role, statut, ...note] = args;
    if (!ROLES.includes(role)) echouer(`rôle inconnu : ${role} (attendu : ${ROLES.join(', ')})`);
    if (!STATUTS.includes(statut)) echouer(`statut inconnu : ${statut} (attendu : ${STATUTS.join(', ')})`);
    preparerWorktree();
    const etat = modifier(`etat(${nuit}): ${role} ${statut}`, (e) => {
      const n = nuitDans(e, nuit);
      const precedent = n.phases[role] ?? {};
      const instant = maintenant();
      n.phases[role] = {
        statut,
        debut: statut === 'en-cours' ? instant : (precedent.debut ?? instant),
        fin: statut === 'en-cours' ? null : instant,
        note: note.join(' ') || precedent.note || null,
      };
    });
    console.log(JSON.stringify(etat.nuits[nuit], null, 2));
    break;
  }
  case 'nuit': {
    const [champ, valeur] = args;
    if (!CHAMPS_NUIT.includes(champ)) echouer(`champ de nuit inconnu : ${champ} (attendu : ${CHAMPS_NUIT.join(', ')})`);
    if (valeur === undefined) echouer('valeur manquante');
    preparerWorktree();
    const etat = modifier(`etat(${nuit}): ${champ}`, (e) => {
      nuitDans(e, nuit)[champ] = parserJson(valeur);
    });
    console.log(JSON.stringify(etat.nuits[nuit], null, 2));
    break;
  }
  case 'global': {
    const [champ, valeur] = args;
    if (!CHAMPS_GLOBAUX.includes(champ)) echouer(`champ global inconnu : ${champ} (attendu : ${CHAMPS_GLOBAUX.join(', ')})`);
    if (valeur === undefined) echouer('valeur manquante');
    preparerWorktree();
    modifier(`etat: ${champ}`, (e) => {
      e[champ] = parserJson(valeur);
    });
    console.log(`${champ} mis à jour`);
    break;
  }
  case 'publier': {
    const message = args.join(' ');
    if (!message) echouer('message de commit manquant');
    preparerWorktree();
    git(['add', '-A']);
    if (git(['diff', '--cached', '--name-only']) === '') {
      console.log('rien à publier');
      break;
    }
    git(['commit', '--quiet', '-m', message]);
    for (let essai = 1; essai <= ESSAIS_MAX; essai += 1) {
      try {
        git(['push', '--quiet', 'origin', 'equipe']);
        console.log('publié');
        process.exit(0);
      } catch {
        git(['pull', '--rebase', '--quiet', 'origin', 'equipe']);
      }
    }
    echouer(`push impossible après ${ESSAIS_MAX} essais`);
    break;
  }
  default:
    echouer('commande attendue : contexte | phase | nuit | global | publier (voir l’en-tête du fichier)');
}
