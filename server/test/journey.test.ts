import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/main.ts';

test('arrival receipt uses real trip duration and the displayed bundle matches the single credited reward', async () => {
  const now = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => now);
  try {
    const guest = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const headers = { authorization: `Bearer ${guest.token}` };
    const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers })).json().code;
    const car = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json();
    const carHeaders = { authorization: `Bearer ${car.token}` };
    const trip = { id: randomUUID(), startedAt: now - 321000, endedAt: now, movingSeconds: 310 };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: carHeaders, payload: trip })).statusCode, 201);
    const before = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
    assert.equal(before.journeys[0].moving_seconds, 310);
    assert.equal(before.journeys[0].id, trip.id);
    assert.equal(before.journeys[0].theme, null);
    assert.deepEqual(before.grants[0].materials, { wood: 8, stone: 6, fabric: 4, seed: 2 });
    const claimed = (await app.inject({ method: 'POST', url: `/v1/grants/${before.grants[0].id}/claim`, headers })).json();
    for (const material of ['wood', 'stone', 'fabric', 'seed'])
      assert.equal(claimed.inventory[material] - before.inventory[material], before.grants[0].materials[material]);
    const repeated = (await app.inject({ method: 'POST', url: `/v1/grants/${before.grants[0].id}/claim`, headers })).json();
    assert.deepEqual(repeated.inventory, claimed.inventory);
    const other = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/state', headers: { authorization: `Bearer ${other.token}` } })).json().journeys, []);
  } finally { await app.close(); db.close(); }
});

test('car arrival receipt reports only newly earned materials and remains stable across retries and mobile claims', async () => {
  let now = Date.parse('2026-11-15T12:00:00+09:00');
  const { app, db } = createApp(':memory:', () => now);
  try {
    const mobile = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const headers = { authorization: `Bearer ${mobile.token}` };
    const code = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers })).json().code;
    const car = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code } })).json();
    const carHeaders = { authorization: `Bearer ${car.token}` };
    const submit = async (seconds: number, theme = 'forest') => {
      const trip = { id: randomUUID(), startedAt: now - (seconds + 1) * 1000, endedAt: now, movingSeconds: seconds, theme };
      assert.equal((await app.inject({ method: 'POST', url: '/v1/trips', headers: carHeaders, payload: trip })).statusCode, 201);
      const url = `/v1/trips/${trip.id}/receipt`;
      return { trip, url, receipt: (await app.inject({ method: 'GET', url, headers: carHeaders })).json() };
    };
    const first = await submit(310);
    assert.deepEqual(first.receipt, { confirmed: true, materials: { wood: 8, stone: 6, fabric: 4, seed: 2 }, scenery: 'forest' });
    const village = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
    await app.inject({ method: 'POST', url: `/v1/grants/${village.grants[0].id}/claim`, headers });
    await app.inject({ method: 'POST', url: '/v1/trips', headers: carHeaders, payload: first.trip });
    assert.deepEqual((await app.inject({ method: 'GET', url: first.url, headers: carHeaders })).json(), first.receipt);
    now += 600_000;
    assert.deepEqual((await submit(30)).receipt, { confirmed: true, materials: { wood: 0, stone: 0, fabric: 0, seed: 0 }, scenery: null });
    now += 700_000;
    assert.deepEqual((await submit(600)).receipt, { confirmed: true, materials: { wood: 4, stone: 3, fabric: 2, seed: 1 }, scenery: null });
    assert.equal((await app.inject({ method: 'GET', url: first.url, headers })).statusCode, 401);
    const other = (await app.inject({ method: 'POST', url: '/v1/guest' })).json();
    const otherCode = (await app.inject({ method: 'POST', url: '/v1/pair-code', headers: { authorization: `Bearer ${other.token}` } })).json().code;
    const otherCar = (await app.inject({ method: 'POST', url: '/v1/pair', payload: { code: otherCode } })).json();
    assert.equal((await app.inject({ method: 'GET', url: first.url, headers: { authorization: `Bearer ${otherCar.token}` } })).statusCode, 404);
    db.prepare('DELETE FROM trip_receipts WHERE trip_id=?').run(first.trip.id);
    assert.deepEqual((await app.inject({ method: 'GET', url: first.url, headers: carHeaders })).json(), { confirmed: false, materials: {}, scenery: null });
  } finally { await app.close(); db.close(); }
});
