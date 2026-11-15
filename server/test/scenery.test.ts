import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/main.ts';

test('scenery is capped across vehicles and themes, unlocks once, and styles are owned and versioned', async () => {
  let clock = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => clock);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const mobile = { authorization: `Bearer ${guest.token}` };
    const pair = async () => {
      const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: mobile })).json().code;
      const result = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json();
      return { authorization: `Bearer ${result.token}` };
    };
    const car = await pair(), otherCar = await pair();
    const trip = { id: randomUUID(), startedAt: clock - 300_000, endedAt: clock, movingSeconds: 300, theme: 'city' };
    for (let i = 0; i < 100; i++) assert.ok([200, 201].includes((await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: trip })).statusCode));
    clock += 400_000;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: otherCar, payload: { ...trip, id: randomUUID(), startedAt: clock - 300_000, endedAt: clock, theme: 'sea' } })).statusCode, 201);
    const state = async () => (await app.inject({ method: 'GET', url: '/v1/state', headers: mobile })).json();
    assert.deepEqual((await state()).scenery.map((x: any) => x.fragments), [1, 0, 0]);
    const made = (await app.inject({ method: 'POST', url: '/v1/craft', headers: mobile, payload: { recipe: 'bench', requestId: randomUUID() } })).json();
    const style = (headers: typeof mobile, theme: string, version = 0) => app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/style`, headers, payload: { theme, villageVersion: version } });
    assert.equal((await style(mobile, 'city')).json().error, 'STYLE_LOCKED');
    for (let i = 0; i < 100; i++) assert.equal((await app.inject({ method: 'POST', url: '/v1/styles/city/unlock', headers: mobile })).statusCode, 200);
    assert.deepEqual((await state()).scenery[0], { theme: 'city', fragments: 0, unlocked: true });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/styles/sea/unlock', headers: mobile })).json().error, 'INSUFFICIENT_FRAGMENTS');
    const outsider = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    assert.equal((await style({ authorization: `Bearer ${outsider.token}` }, 'city')).statusCode, 404);
    assert.equal((await style(mobile, 'city')).json().items[0].style, 'city');
    assert.equal((await style(mobile, 'city')).json().error, 'STALE');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/styles/sea/unlock', headers: mobile, payload: { fragments: 100 } })).statusCode, 400);
    clock += 86_400_000;
    await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: { ...trip, id: randomUUID(), startedAt: clock - 300_000, endedAt: clock, theme: 'sea' } });
    assert.equal((await state()).scenery[2].fragments, 1);
    clock += 86_400_000;
    await app.inject({ method: 'POST', url: '/v1/trips', headers: car, payload: { id: randomUUID(), startedAt: clock - 300_000, endedAt: clock, movingSeconds: 300 } });
    assert.equal((await state()).scenery.reduce((n: number, x: any) => n + x.fragments, 0), 1);
  } finally { await app.close(); db.close(); }
});

test('quest scenery enables a style without driving and repeated claims cannot duplicate it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'letspleo-scenery-'));
  const path = join(directory, 'state.sqlite');
  let { app, db } = createApp(path);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const headers = { authorization: `Bearer ${guest.token}` };
    const made = (await app.inject({ method: 'POST', url: '/v1/craft', headers, payload: { recipe: 'bench', requestId: randomUUID() } })).json();
    await app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/place`, headers, payload: { x: 3, z: 3, rotation: 0, villageVersion: 0 } });
    const claim = () => app.inject({ method: 'POST', url: '/v1/quests/q01/claim', headers });
    assert.equal((await claim()).json().scenery[0].fragments, 1);
    assert.equal((await claim()).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/styles/city/unlock', headers })).json().scenery[0].unlocked, true);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/items/${made.itemId}/style`, headers, payload: { theme: 'city', villageVersion: 1 } })).json().items[0].style, 'city');
    const before = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
    await app.close(); db.close();
    ({ app, db } = createApp(path));
    assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/state', headers })).json(), before);
    // Simulate a pre-scenery database which already completed q01.
    db.exec('DROP TABLE item_styles; DROP TABLE scenery_unlocks; DROP TABLE scenery_earnings');
    await app.close(); db.close();
    ({ app, db } = createApp(path));
    assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/state', headers })).json().scenery[0], { theme: 'city', fragments: 1, unlocked: false });
    await app.close(); db.close();
    ({ app, db } = createApp(path));
    assert.equal((await app.inject({ method: 'GET', url: '/v1/state', headers })).json().scenery[0].fragments, 1);
  } finally { await app.close(); db.close(); await rm(directory, { recursive: true, force: true }); }
});
