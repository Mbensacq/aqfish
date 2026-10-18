#!/usr/bin/env node
/**
 * Outil d'état partagé de l'équipe aqfish — mode continu (schéma 2).
 *
 * L'équipe enchaîne des **cycles** (Planif → Dev → QA → Revue) sans attendre la nuit :
 * chaque rôle, en fin de phase, lance le suivant ; la tâche « Relance » rattrape les
 * enchaînements perdus. Un plafond de cycles par jour (heure de Paris) protège le quota.
 *
 * Usage (depuis n'importe où dans le clone de main) :
 *   node .agents/outils/etat.mjs contexte
 *       Prépare le worktree ../equipe et affiche en JSON : cycle courant, sprint, type, pause,
 *       prochain rôle à lancer, nombre de cycles du jour, plafond.
 *   node .agents/outils/etat.mjs suivant
 *       Affiche en JSON le rôle à lancer maintenant et le nom de sa tâche planifiée
 *       ({ "role": null, … } si personne : pause, plafond, phase en cours).
 *   node .agents/outils/etat.mjs phase <role> <statut> [note]
 *       Rôles : planif, dev, qa, revue. Statuts : en-cours, termine, echec, saute.
 *       « en-cours » n'est accepté que si c'est le tour du rôle ; « planif en-cours » sur un
 *       cycle clos ouvre le cycle suivant.
 *   node .agents/outils/etat.mjs cycle <champ> <valeur-json>
 *       Champ du cycle courant : issue, pr, version, metriques.
 *   node .agents/outils/etat.mjs jour <champ> <valeur-json>
 *       Champ du jour (Paris) : rapport, metriques (Superviseur).
 *   node .agents/outils/etat.mjs global <champ> <valeur-json>
 *       Champ global : pause, motifPause, experience.
 *   node .agents/outils/etat.mjs publier <message>
 *       Commite et pousse tout ce qui a changé dans le worktree (journal, captures…).
 *
 * Variables d'environnement :
 *   EQUIPE_DIR   chemin du worktree (défaut : <dépôt>/../equipe)
 *   MAINTENANT   date ISO forcée (tests)
 *
 * Fichier protégé (zone `.agents/**`) : modifications par PR `validation-mathis` uniquement.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PHASES = ['planif', 'dev', 'qa', 'revue'];
const TACHES = {
  planif: 'aqfish — 1. Planif',
  dev: 'aqfish — 2. Dev',
  qa: 'aqfish — 3. QA',
  revue: 'aqfish — 4. Revue & release',
};
const STATUTS = ['en-cours', 'termine', 'echec', 'saute'];
const FINIS = ['termine', 'echec', 'saute'];
const CHAMPS_CYCLE = ['issue', 'pr', 'version', 'metriques'];
const CHAMPS_JOUR = ['rapport', 'metriques'];
const CHAMPS_GLOBAUX = ['pause', 'motifPause', 'experience'];
const TYPES_PAR_JOUR = ['fonctionnalite', 'fonctionnalite', 'fonctionnalite', 'fonctionnalite', 'fonctionnalite', 'dette', 'retro'];
const PLAFOND_PAR_DEFAUT = 12;
const PHASE_BLOQUEE_APRES_MS = 3 * 3600 * 1000;
const PROPRIETAIRE = 'Mbensacq';
const ESSAIS_MAX = 4;

const depot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const equipeDir = resolve(process.env.EQUIPE_DIR ?? resolve(depot, '..', 'equipe'));
const etatPath = resolve(equipeDir, 'etat.json');

function echouer(message) {
  console.error(`etat.mjs : ${message}`);
  process.exit(1);
}

function git(args, cwd = equipeDir) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (erreur) {
    const detail = String(erreur.stderr ?? erreur.message).trim();
    throw new Error(`git ${args.join(' ')} a échoué : ${detail}`);
  }
}

function maintenant() {
  const force = process.env.MAINTENANT;
  if (force) {
    const date = new Date(force);
    if (Number.isNaN(date.getTime())) echouer(`MAINTENANT invalide : ${force}`);
    return date;
  }
  return new Date();
}

/** Date AAAA-MM-JJ en heure de Paris. */
function jourParis(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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

/** Applique une modification à etat.json, commite et pousse, avec relance en cas de course. */
function modifier(message, transformation) {
  for (let essai = 1; essai <= ESSAIS_MAX; essai += 1) {
    git(['pull', '--rebase', '--autostash', '--quiet', 'origin', 'equipe']);
    const etat = migrer(lireEtat());
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

/** Schéma 1 (une nuit par date) → schéma 2 (cycles numérotés). Sans effet sur un schéma 2. */
function migrer(etat) {
  if (etat.schema === 2) return etat;
  if (etat.schema !== 1) echouer(`schéma d'état inconnu : ${etat.schema}`);
  const cycles = {};
  const jours = {};
  Object.keys(etat.nuits ?? {})
    .sort()
    .forEach((date, numero) => {
      const nuit = etat.nuits[date];
      const { superviseur, ...phases } = nuit.phases ?? {};
      cycles[numero] = {
        numero,
        date,
        debut: phases.planif?.debut ?? null,
        type: nuit.type ?? null,
        issue: nuit.issue ?? null,
        pr: nuit.pr ?? null,
        version: nuit.version ?? null,
        phases,
        metriques: nuit.metriques ?? {},
      };
      if (superviseur || nuit.metriques) {
        jours[date] = { rapport: superviseur ?? null, metriques: nuit.metriques ?? {} };
      }
    });
  const { finsDePhase: _abandonne, ...experience } = etat.experience ?? {};
  return {
    schema: 2,
    pause: etat.pause ?? false,
    motifPause: etat.motifPause ?? null,
    experience: { ...experience, plafondParJour: PLAFOND_PAR_DEFAUT },
    cycles,
    jours,
  };
}

function calendrier(numero) {
  if (numero === null || numero === undefined) return { sprint: null, jour: null, type: null };
  const jour = numero % 7;
  return { sprint: Math.floor(numero / 7) + 1, jour, type: TYPES_PAR_JOUR[jour] };
}

function cycleCourant(etat) {
  const numeros = Object.keys(etat.cycles ?? {}).map(Number);
  return numeros.length ? etat.cycles[Math.max(...numeros)] : null;
}

function estClos(cycle) {
  return !!cycle && FINIS.includes(cycle.phases?.revue?.statut);
}

function cyclesDuJour(etat, date) {
  const jour = jourParis(date);
  return Object.values(etat.cycles ?? {}).filter((c) => c.debut && jourParis(new Date(c.debut)) === jour).length;
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

function pauseEffective(etat, stop) {
  if (etat.pause === true) return { pause: true, motif: etat.motifPause ?? 'pause' };
  if (Array.isArray(stop) && stop.length > 0) return { pause: true, motif: `issue(s) stop ouverte(s) : ${stop.join(', ')}` };
  return { pause: false, motif: null };
}

/** Instant ISO de la dernière activité enregistrée (début ou fin de phase) du cycle courant. */
function derniereActivite(cycle) {
  const instants = Object.values(cycle?.phases ?? {})
    .flatMap((p) => [p.debut, p.fin])
    .filter(Boolean)
    .sort();
  return instants.at(-1) ?? cycle?.debut ?? null;
}

/** Rôle à lancer maintenant, d'après l'état (sans effet de bord). */
function prochain(etat, date, pause) {
  const suite = prochainSansActivite(etat, date, pause);
  return { ...suite, derniereActivite: derniereActivite(cycleCourant(etat)) };
}

function prochainSansActivite(etat, date, pause) {
  if (pause.pause) return { role: null, raison: `pause : ${pause.motif}` };
  const courant = cycleCourant(etat);
  if (!courant || estClos(courant)) {
    const plafond = etat.experience?.plafondParJour ?? PLAFOND_PAR_DEFAUT;
    const faits = cyclesDuJour(etat, date);
    if (faits >= plafond) return { role: null, raison: `plafond atteint (${faits}/${plafond} cycles aujourd'hui)` };
    const numero = courant ? courant.numero + 1 : 0;
    return { role: 'planif', cycle: numero, tache: TACHES.planif, raison: `nouveau cycle ${numero}` };
  }
  for (const role of PHASES) {
    const phase = courant.phases?.[role];
    if (phase && FINIS.includes(phase.statut)) continue;
    if (phase?.statut === 'en-cours') {
      const age = date.getTime() - new Date(phase.debut).getTime();
      if (age > PHASE_BLOQUEE_APRES_MS) {
        return { role, cycle: courant.numero, tache: TACHES[role], bloquee: true, raison: `${role} en cours depuis plus de 3 h` };
      }
      return { role: null, enCours: role, cycle: courant.numero, raison: `${role} en cours` };
    }
    return { role, cycle: courant.numero, tache: TACHES[role], raison: `au tour de ${role}` };
  }
  return { role: null, raison: 'cycle complet' };
}

function parserJson(valeur) {
  try {
    return JSON.parse(valeur);
  } catch {
    echouer(`valeur JSON invalide : ${valeur}`);
  }
}

function lireMigrer() {
  preparerWorktree();
  const brut = lireEtat();
  if (brut.schema === 1) {
    return modifier('etat: migration vers le mode continu (schéma 2)', () => {});
  }
  return migrer(brut);
}

const [commande, ...args] = process.argv.slice(2);
process.on('uncaughtException', (erreur) => echouer(erreur.message));
const date = maintenant();

switch (commande) {
  case 'contexte': {
    const etat = lireMigrer();
    const stop = issuesStop();
    const pause = pauseEffective(etat, stop);
    const courant = cycleCourant(etat);
    const suite = prochain(etat, date, pause);
    const numeroAffiche = suite.role === 'planif' ? suite.cycle : (courant?.numero ?? null);
    console.log(
      JSON.stringify(
        {
          maintenant: date.toISOString(),
          cycle: numeroAffiche,
          ...calendrier(numeroAffiche),
          pause: pause.pause,
          motifPause: pause.motif,
          verificationStop: stop === null ? 'impossible (gh indisponible) : vérifier à la main' : 'ok',
          prochain: suite,
          cyclesAujourdhui: cyclesDuJour(etat, date),
          plafondParJour: etat.experience?.plafondParJour ?? PLAFOND_PAR_DEFAUT,
          cycleCourant: suite.role === 'planif' ? null : courant,
          cyclePrecedent: suite.role === 'planif' ? courant : (etat.cycles?.[(courant?.numero ?? 0) - 1] ?? null),
          experience: etat.experience ?? null,
          worktree: equipeDir,
        },
        null,
        2,
      ),
    );
    break;
  }
  case 'suivant': {
    const etat = lireMigrer();
    const pause = pauseEffective(etat, issuesStop());
    console.log(JSON.stringify(prochain(etat, date, pause), null, 2));
    break;
  }
  case 'phase': {
    const [role, statut, ...note] = args;
    if (!PHASES.includes(role)) echouer(`rôle inconnu : ${role} (attendu : ${PHASES.join(', ')})`);
    if (!STATUTS.includes(statut)) echouer(`statut inconnu : ${statut} (attendu : ${STATUTS.join(', ')})`);
    lireMigrer();
    const stop = statut === 'en-cours' ? issuesStop() : [];
    const etat = modifier(`etat: ${role} ${statut}`, (e) => {
      const instant = date.toISOString();
      let courant = cycleCourant(e);
      if (statut === 'en-cours') {
        const suite = prochain(e, date, pauseEffective(e, stop));
        if (suite.role !== role) echouer(`pas le tour de ${role} (${suite.raison})`);
        if (role === 'planif' && (!courant || estClos(courant))) {
          const numero = courant ? courant.numero + 1 : 0;
          courant = { numero, date: jourParis(date), debut: instant, ...calendrier(numero), issue: null, pr: null, version: null, phases: {}, metriques: {} };
          delete courant.sprint;
          delete courant.jour;
          e.cycles[numero] = courant;
        }
      }
      if (!courant) echouer('aucun cycle en cours');
      const precedent = courant.phases[role] ?? {};
      courant.phases[role] = {
        statut,
        debut: statut === 'en-cours' ? instant : (precedent.debut ?? instant),
        fin: statut === 'en-cours' ? null : instant,
        note: note.join(' ') || (statut === 'en-cours' ? null : precedent.note) || null,
      };
    });
    console.log(JSON.stringify(cycleCourant(etat), null, 2));
    break;
  }
  case 'cycle': {
    const [champ, valeur] = args;
    if (!CHAMPS_CYCLE.includes(champ)) echouer(`champ de cycle inconnu : ${champ} (attendu : ${CHAMPS_CYCLE.join(', ')})`);
    if (valeur === undefined) echouer('valeur manquante');
    lireMigrer();
    const etat = modifier(`etat: cycle ${champ}`, (e) => {
      const courant = cycleCourant(e);
      if (!courant) echouer('aucun cycle');
      courant[champ] = parserJson(valeur);
    });
    console.log(JSON.stringify(cycleCourant(etat), null, 2));
    break;
  }
  case 'jour': {
    const [champ, valeur] = args;
    if (!CHAMPS_JOUR.includes(champ)) echouer(`champ de jour inconnu : ${champ} (attendu : ${CHAMPS_JOUR.join(', ')})`);
    if (valeur === undefined) echouer('valeur manquante');
    lireMigrer();
    const jour = jourParis(date);
    const etat = modifier(`etat(${jour}): ${champ}`, (e) => {
      e.jours ??= {};
      e.jours[jour] ??= {};
      e.jours[jour][champ] = parserJson(valeur);
    });
    console.log(JSON.stringify(etat.jours[jour], null, 2));
    break;
  }
  case 'global': {
    const [champ, valeur] = args;
    if (!CHAMPS_GLOBAUX.includes(champ)) echouer(`champ global inconnu : ${champ} (attendu : ${CHAMPS_GLOBAUX.join(', ')})`);
    if (valeur === undefined) echouer('valeur manquante');
    lireMigrer();
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
    echouer('commande attendue : contexte | suivant | phase | cycle | jour | global | publier (voir l’en-tête du fichier)');
}
