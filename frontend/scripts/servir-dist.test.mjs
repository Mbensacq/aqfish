import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { contentType, createDistServer, fileFor } from './servir-dist.mjs';

describe('servir-dist : chemins', () => {
  const root = resolve('/srv/dist');

  it('résout un fichier du dossier servi', () => {
    assert.equal(fileFor(root, '/main.js'), join(root, 'main.js'));
    assert.equal(fileFor(root, '/assets/a%20b.png'), join(root, 'assets', 'a b.png'));
    assert.equal(fileFor(root, '/'), root);
  });

  it('refuse tout chemin qui sort du dossier', () => {
    assert.equal(fileFor(root, '/../secret'), null);
    assert.equal(fileFor(root, '/%2e%2e/secret'), null);
    assert.equal(fileFor(root, '/a/../../secret'), null);
    assert.equal(fileFor(root, '/..\\secret'), null);
    assert.equal(fileFor('/srv/dist', '/../dist-voisin/x'), null);
  });

  it('refuse un encodage invalide', () => {
    assert.equal(fileFor(root, '/%E0%A4%A'), null);
  });

  it('donne le type MIME selon l’extension', () => {
    assert.equal(contentType('main.js'), 'text/javascript; charset=utf-8');
    assert.equal(contentType('rapier.WASM'), 'application/wasm');
    assert.equal(contentType('inconnu.xyz'), 'application/octet-stream');
  });
});

describe('servir-dist : serveur', () => {
  let server;
  let base;

  before(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'servir-dist-'));
    writeFileSync(join(dir, 'index.html'), '<p>aqfish</p>');
    mkdirSync(join(dir, 'media'));
    writeFileSync(join(dir, 'media', 'son.ogg'), 'OggS');
    server = createDistServer(dir);
    await new Promise((done) => server.listen(0, done));
    base = `http://localhost:${server.address().port}`;
  });

  after(() => new Promise((done) => server.close(done)));

  it('sert un fichier avec son type', async () => {
    const response = await fetch(`${base}/media/son.ogg`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/ogg');
    assert.equal(await response.text(), 'OggS');
  });

  it('renvoie index.html pour une route de l’application, requête comprise', async () => {
    const response = await fetch(`${base}/?capture=1&seed=42`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<p>aqfish</p>');
    assert.equal((await fetch(`${base}/inconnu`)).status, 200);
  });

  it('ne sert jamais un fichier hors du dossier, même pour un chemin brut en « .. »', async () => {
    // `fetch` normalise les `..` : requête brute pour envoyer le chemin tel quel. Le serveur
    // ramène le chemin dans le dossier : il répond par l'application, pas par le fichier visé.
    const body = await new Promise((done, fail) => {
      const request = http.request(`${base}/`, { path: '/../../etc/passwd' }, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => done(text));
      });
      request.on('error', fail);
      request.end();
    });
    assert.equal(body, '<p>aqfish</p>');
  });
});
