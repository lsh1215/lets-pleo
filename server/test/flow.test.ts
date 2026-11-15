import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/main.ts';

test('paired car trip becomes one mobile reward, then a crafted village item', async () => {
  const clock = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const paired = await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } });
    assert.equal(paired.statusCode, 200);
    const car = { authorization: `Bearer ${paired.json().token}` };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).statusCode, 409);
    const trip = { id: randomUUID(), startedAt: clock - 600_000, endedAt: clock - 1_000, movingSeconds: 350 };
    const first = await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip });
    assert.equal(first.statusCode, 201);
    const replay = await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip });
    assert.deepEqual(replay.json(), { accepted: true, duplicate: true });
    let state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.grants.length, 1);
    const grantId = state.grants[0].id;
    const claim = () => app.inject({ method: 'POST', url: `/v1/grants/${grantId}/claim`, headers: mobile });
    await claim(); await claim();
    state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.inventory.wood, 12);
    const requestId = randomUUID();
    const craft = () => app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId } });
    const made = (await craft()).json();
    assert.equal((await craft()).json().itemId, made.itemId);
    const placed = await app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/place`, headers: mobile, payload: { x: 2, z: 3, rotation: 90, villageVersion: 0 } });
    assert.equal(placed.statusCode, 200);
    assert.equal(placed.json().items[0].x, 2);
    assert.equal(placed.json().inventory.wood, 8);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/place`, headers: mobile, payload: { x: 3, z: 3, rotation: 90, villageVersion: 0 } })).statusCode, 409);
    const other = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    assert.equal((await app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/place`, headers: { authorization: `Bearer ${other.token}` }, payload: { x: 3, z: 3, rotation: 90, villageVersion: 0 } })).statusCode, 404);
  } finally { await app.close(); db.close(); }
});

test('placement rejects overlap, bounds, and closing both village entrance cells', async () => {
  const { app, db } = createApp(':memory:');
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const craft = async () => (await app.inject({
      method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'stool', requestId: randomUUID() },
    })).json().itemId as string;
    const first = await craft(), second = await craft();
    const place = (item: string, x: number, z: number, villageVersion: number) => app.inject({
      method: 'POST', url: `/v1/items/${item}/place`, headers: mobile,
      payload: { x, z, rotation: 0, villageVersion },
    });
    assert.equal((await place(first, 0, 5, 0)).statusCode, 200);
    const blocked = await place(second, 0, 6, 1);
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.json().error, 'ENTRANCE_BLOCKED');
    assert.equal((await place(second, 0, 5, 1)).json().error, 'OCCUPIED');
    assert.equal((await place(second, 12, 0, 1)).json().error, 'OUT_OF_BOUNDS');
    const open = await place(second, 1, 6, 1);
    assert.equal(open.statusCode, 200);
    assert.equal(open.json().villageVersion, 2);
  } finally { await app.close(); db.close(); }
});

test('pairing expires, limits wrong codes, and revoked vehicles lose access', async () => {
  let clock = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const expired = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    clock += 300_001;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/pair', payload: { code: expired } })).statusCode, 409);
    const valid = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const wrong = valid === '00000000' ? '99999999' : '00000000';
    for (let i = 0; i < 4; i++) assert.equal((await app.inject({ method: 'POST', url: '/v1/pair', payload: { code: wrong } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/pair', payload: { code: valid } })).statusCode, 429);
    clock += 600_001;
    const current = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const pair = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code: current } })).json();
    const car = { authorization: `Bearer ${pair.token}` };
    assert.equal((await app.inject({ method: 'GET', url: '/v1/state', headers: car })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/craft', headers: car, payload: { recipe: 'bench', requestId: randomUUID() } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: mobile, payload: { id: randomUUID(), startedAt: clock - 600_000, endedAt: clock - 1_000, movingSeconds: 300 } })).statusCode, 401);
    const devices = (await app.inject({ method: 'GET', url: '/v1/devices', headers: mobile })).json().devices;
    assert.equal(devices.length, 1);
    assert.equal(devices[0].id, pair.deviceId);
    assert.equal((await app.inject({ method: 'DELETE', url: `/v1/devices/${pair.deviceId}`, headers: mobile })).statusCode, 200);
    assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/devices', headers: mobile })).json().devices, []);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: { id: randomUUID(), startedAt: clock - 600_000, endedAt: clock - 1_000, movingSeconds: 300 } })).statusCode, 401);
  } finally { await app.close(); db.close(); }
});

test('replayed trips and claims stay single, while concurrent crafting respects balances', async () => {
  const clock = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const paired = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json();
    const car = { authorization: `Bearer ${paired.token}` };
    const trip = { id: randomUUID(), startedAt: clock - 700_000, endedAt: clock - 100_000, movingSeconds: 350 };
    const first = await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip });
    assert.equal(first.statusCode, 201);
    for (let i = 0; i < 100; i++) {
      const replay = await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip });
      assert.deepEqual(replay.json(), { accepted: true, duplicate: true });
    }
    let state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.grants.length, 1);
    for (let i = 0; i < 100; i++) {
      const claim = await app.inject({ method: 'POST', url: `/v1/grants/${state.grants[0].id}/claim`, headers: mobile });
      assert.equal(claim.statusCode, 200);
    }
    state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.inventory.wood, 12);
    assert.equal(state.inventory.stone, 7);
    const attempts = await Promise.all(Array.from({ length: 10 }, () => app.inject({
      method: 'POST', url: '/v1/craft', headers: mobile,
      payload: { recipe: 'bench', requestId: randomUUID() },
    })));
    assert.equal(attempts.filter(response => response.statusCode === 200).length, 3);
    assert.equal(attempts.filter(response => response.statusCode === 409).length, 7);
    state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.inventory.wood, 0);
    assert.equal(state.inventory.stone, 4);
    assert.equal(state.items.length, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trips').get().count, 1);
  } finally { await app.close(); db.close(); }
});

test('village survives restart and SQLite backup restores the same state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lets-pleo-db-test-'));
  const databasePath = join(directory, 'main.sqlite');
  const backupPath = join(directory, 'backup.sqlite');
  const clock = Date.parse('2026-11-15T12:00:00+09:00');
  let main = createApp(databasePath, () => clock);
  try {
    const guest = (await main.app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const made = (await main.app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID() } })).json();
    assert.ok(made.itemId);
    const placed = await main.app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/place`, headers: mobile, payload: { x: 2, z: 2, rotation: 90, villageVersion: 0 } });
    assert.equal(placed.statusCode, 200);
    assert.equal((await main.app.inject({ method: 'POST', url: '/v1/quests/q01/claim', headers: mobile })).statusCode, 200);
    assert.equal((await main.app.inject({ method: 'POST', url: '/v1/garden/harvest', headers: mobile })).statusCode, 200);
    const expected = (await main.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    await main.db.backup(backupPath);
    await main.app.close(); main.db.close();
    main = createApp(databasePath, () => clock);
    const restarted = (await main.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.deepEqual(restarted, expected);
    const backup = createApp(backupPath, () => clock);
    try {
      const restored = (await backup.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
      assert.deepEqual(restored, expected);
    } finally { await backup.app.close(); backup.db.close(); }
  } finally { await main.app.close(); if (main.db.open) main.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('midnight trips split movement across Seoul days and keep the daily cap', async () => {
  const clock = Date.parse('2026-11-16T00:10:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const pair = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json();
    const car = { authorization: `Bearer ${pair.token}` };
    const cross = { id: randomUUID(), startedAt: Date.parse('2026-11-15T23:58:00+09:00'), endedAt: Date.parse('2026-11-16T00:03:00+09:00'), movingSeconds: 300 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: cross })).statusCode, 201);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json().grants.length, 0);
    const next = { id: randomUUID(), startedAt: cross.endedAt, endedAt: Date.parse('2026-11-16T00:05:00+09:00'), movingSeconds: 120 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: next })).statusCode, 201);
    let grants = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json().grants;
    assert.deepEqual(grants.map((grant: { day: string; tier: string }) => [grant.day, grant.tier]), [['2026-11-16', 'base']]);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: { ...cross, id: randomUUID() } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: { ...next, id: randomUUID(), movingSeconds: 121 } })).statusCode, 400);
    const extra = { id: randomUUID(), startedAt: next.endedAt, endedAt: Date.parse('2026-11-16T00:10:00+09:00'), movingSeconds: 300 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: extra })).statusCode, 201);
    grants = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json().grants;
    assert.equal(grants.length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trips').get().count, 3);
  } finally { await app.close(); db.close(); }
});

test('placed furniture rotates, moves, stores, and can be placed again after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lets-pleo-edit-test-'));
  const databasePath = join(directory, 'village.sqlite');
  let runtime = createApp(databasePath);
  try {
    const guest = (await runtime.app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const item = (await runtime.app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID() } })).json().itemId;
    const place = (x: number, z: number, rotation: number, villageVersion: number) => runtime.app.inject({
      method: 'POST', url: `/v1/items/${item}/place`, headers: mobile, payload: { x, z, rotation, villageVersion },
    });
    assert.equal((await place(4, 4, 0, 0)).statusCode, 200);
    assert.equal((await place(4, 4, 90, 1)).json().items[0].rotation, 90);
    assert.equal((await place(5, 5, 90, 2)).json().items[0].x, 5);
    assert.equal((await place(6, 6, 0, 2)).statusCode, 409);
    const stored = await runtime.app.inject({ method: 'POST', url: `/v1/items/${item}/store`, headers: mobile, payload: { villageVersion: 3 } });
    assert.equal(stored.statusCode, 200);
    assert.equal(stored.json().items[0].x, null);
    await runtime.app.close(); runtime.db.close();
    runtime = createApp(databasePath);
    const restored = (await runtime.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(restored.items[0].x, null);
    assert.equal(restored.items[0].rotation, 90);
    assert.equal((await place(6, 6, 180, restored.villageVersion)).statusCode, 200);
  } finally { await runtime.app.close(); if (runtime.db.open) runtime.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('foreign accounts and client supplied rewards, costs, or ownership are rejected', async () => {
  const clock = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const first = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const second = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${first.token}` };
    const foreign = { authorization: `Bearer ${second.token}` };
    const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const car = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json().token}` };
    const trip = { id: randomUUID(), startedAt: clock - 400_000, endedAt: clock - 1_000, movingSeconds: 350 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: { ...trip, accountId: second.accountId, rewardAmount: 9999 } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip })).statusCode, 201);
    const grant = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json().grants[0];
    assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/state', headers: foreign })).json().grants, []);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/grants/${grant.id}/claim`, headers: foreign })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/grants/${grant.id}/claim`, headers: mobile, payload: { amount: 9999 } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID(), cost: { wood: 0 }, accountId: second.accountId } })).statusCode, 400);
    const item = (await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID() } })).json().itemId;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/items/${item}/place`, headers: foreign, payload: { x: 1, z: 1, rotation: 0, villageVersion: 0 } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/items/${item}/place`, headers: mobile, payload: { x: 1, z: 1, rotation: 0, villageVersion: 0, owner: second.accountId } })).statusCode, 400);
    const state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.inventory.wood, 0);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].x, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trips').get().count, 1);
  } finally { await app.close(); db.close(); }
});

test('content catalog contains 24 distinct furnishings and three buildings with footprint collision', async () => {
  const { app, db } = createApp(':memory:');
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const content = (await app.inject({ method: 'GET', url: '/v1/content', headers: mobile })).json();
    assert.equal(content.version, 2);
    assert.equal(content.styles.length, 3);
    assert.equal(content.catalog.filter((entry: { kind: string }) => entry.kind === 'furniture').length, 24);
    assert.equal(content.catalog.filter((entry: { kind: string }) => entry.kind === 'building').length, 3);
    assert.equal(new Set(content.catalog.map((entry: { id: string }) => entry.id)).size, 27);
    for (const material of ['wood', 'stone', 'fabric', 'seed']) db.prepare('UPDATE inventory SET quantity=100 WHERE account_id=? AND material=?').run(guest.accountId, material);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'toString', requestId: randomUUID() } })).statusCode, 400);
    const workshop = (await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'workshop', requestId: randomUUID() } })).json().itemId;
    assert.ok(workshop);
    const place = (itemId: string, x: number, z: number, villageVersion: number) => app.inject({ method: 'POST', url: `/v1/items/${itemId}/place`, headers: mobile, payload: { x, z, rotation: 0, villageVersion } });
    assert.equal((await place(workshop, 11, 11, 0)).statusCode, 400);
    assert.equal((await place(workshop, 8, 8, 0)).statusCode, 200);
    const bench = (await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID() } })).json().itemId;
    assert.equal((await place(bench, 9, 9, 1)).statusCode, 409);
    assert.equal((await place(bench, 10, 10, 1)).statusCode, 200);
  } finally { await app.close(); db.close(); }
});

test('seven garden days fund all fourteen quests, three residents, and both village expansions without driving', async () => {
  let clock = Date.parse('2026-11-15T09:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    for (let day = 0; day < 7; day++) {
      const first = (await app.inject({ method: 'POST', url: '/v1/garden/harvest', headers: mobile })).json();
      assert.equal(first.harvested, true);
      const repeated = (await app.inject({ method: 'POST', url: '/v1/garden/harvest', headers: mobile })).json();
      assert.equal(repeated.harvested, false);
      clock += 86_400_000;
    }
    const placements: Array<[string, number, number]> = [
      ['bench', 2, 2], ['flowerbed', 3, 2], ['lamp', 4, 2], ['workshop', 5, 2],
      ['table', 7, 2], ['planter', 8, 2], ['cottage', 2, 5], ['bookshelf', 4, 5],
      ['tea_house', 6, 5], ['fountain', 8, 5], ['bridge', 9, 5], ['flower_arch', 10, 5],
    ];
    let version = 0;
    for (const [recipe, x, z] of placements) {
      const made = await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe, requestId: randomUUID() } });
      assert.equal(made.statusCode, 200, `${recipe} craft: ${made.body}`);
      const placed = await app.inject({ method: 'POST', url: `/v1/items/${made.json().itemId}/place`, headers: mobile,
        payload: { x, z, rotation: 0, villageVersion: version } });
      assert.equal(placed.statusCode, 200, `${recipe} place: ${placed.body}`);
      version++;
    }
    for (let number = 1; number <= 14; number++) {
      const id = `q${String(number).padStart(2, '0')}`;
      const claimed = await app.inject({ method: 'POST', url: `/v1/quests/${id}/claim`, headers: mobile });
      assert.equal(claimed.statusCode, 200, `${id}: ${claimed.body}`);
      assert.equal((await app.inject({ method: 'POST', url: `/v1/quests/${id}/claim`, headers: mobile })).statusCode, 409);
    }
    const state = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.gridSize, 20);
    assert.deepEqual(state.residents, ['botta', 'todam', 'saemi']);
    assert.equal(state.quests.filter((quest: { claimed: boolean }) => quest.claimed).length, 14);
    assert.equal(state.garden.harvestDays, 7);
    assert.ok(Object.values(state.inventory).every(amount => typeof amount === 'number' && amount >= 0));
  } finally { await app.close(); db.close(); }
});

test('SIGKILL inside claim and craft transactions never leaves a partial ledger', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lets-pleo-crash-test-'));
  const databasePath = join(directory, 'crash.sqlite');
  let runtime = createApp(databasePath);
  try {
    const guest = (await runtime.app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const code = (await runtime.app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
    const car = { authorization: `Bearer ${(await runtime.app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json().token}` };
    const now = Date.now();
    const trip = { id: randomUUID(), startedAt: now - 400_000, endedAt: now - 1_000, movingSeconds: 350 };
    assert.equal((await runtime.app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip })).statusCode, 201);
    const grantId = (await runtime.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json().grants[0].id;
    await runtime.app.close(); runtime.db.close();
    const child = fileURLToPath(new URL('./helpers/crash-child.ts', import.meta.url));
    const crash = (action: string) => spawnSync(process.execPath, ['--import', 'tsx', child, databasePath, action, guest.token, grantId], { cwd: process.cwd(), timeout: 10_000 });
    assert.equal(crash('claim').signal, 'SIGKILL');
    runtime = createApp(databasePath);
    let state = (await runtime.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.equal(state.grants[0].claimed_at, null);
    assert.deepEqual(state.inventory, { wood: 4, stone: 1, fabric: 0, seed: 0 });
    assert.equal((await runtime.app.inject({ method: 'POST', url: `/v1/grants/${grantId}/claim`, headers: mobile })).statusCode, 200);
    state = (await runtime.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    const beforeCraft = state.inventory;
    await runtime.app.close(); runtime.db.close();
    assert.equal(crash('craft').signal, 'SIGKILL');
    runtime = createApp(databasePath);
    state = (await runtime.app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.deepEqual(state.inventory, beforeCraft);
    assert.equal(state.items.length, 0);
    assert.equal((await runtime.app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID() } })).statusCode, 200);
  } finally { await runtime.app.close(); if (runtime.db.open) runtime.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('split trips from two paired vehicles never create more than two daily grants', async () => {
  const clock = Date.parse('2026-11-15T15:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const cars = [];
    for (let index = 0; index < 2; index++) {
      const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
      cars.push({ authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json().token}` });
    }
    const trips = [];
    for (let index = 0; index < 4; index++) {
      const startedAt = clock - 1_800_000 + index * 300_000;
      const trip = { id: randomUUID(), startedAt, endedAt: startedAt + 300_000, movingSeconds: 300 };
      trips.push(trip);
      assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: cars[index % 2], payload: trip })).statusCode, 201);
      const grants = (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json().grants;
      assert.equal(grants.length, index < 2 ? 1 : 2);
    }
    const overlap = { id: randomUUID(), startedAt: trips[0].startedAt + 1_000, endedAt: trips[0].endedAt + 1_000, movingSeconds: 300 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: cars[1], payload: overlap })).statusCode, 409);
    assert.deepEqual((await app.inject({ method: 'POST', url: '/v1/trips', headers: cars[1], payload: trips[0] })).json(), { accepted: true, duplicate: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM grants').get().count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trips').get().count, 4);
  } finally { await app.close(); db.close(); }
});
