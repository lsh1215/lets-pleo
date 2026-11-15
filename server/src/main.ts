import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { catalog, catalogById, materials, quests, residents, recipes, type Material, type Quest } from './content.js';

const footprint = (recipe: string, rotation: number) => {
  const [width, height] = catalogById.get(recipe)?.footprint ?? [1, 1];
  return rotation === 90 || rotation === 270 ? [height, width] : [width, height];
};
const intersects = (a: { x: number; z: number; recipe: string; rotation: number }, b: { x: number; z: number; recipe: string; rotation: number }) => {
  const [aw, ah] = footprint(a.recipe, a.rotation);
  const [bw, bh] = footprint(b.recipe, b.rotation);
  return a.x < b.x + bw && a.x + aw > b.x && a.z < b.z + bh && a.z + ah > b.z;
};
const entranceReachable = (size: number, items: { x: number; z: number; recipe: string; rotation: number }[]) => {
  const occupied = new Uint8Array(size * size);
  for (const item of items) {
    const [width, height] = footprint(item.recipe, item.rotation);
    for (let z = item.z; z < item.z + height; z++)
      for (let x = item.x; x < item.x + width; x++)
        occupied[z * size + x] = 1;
  }
  const visited = new Uint8Array(size * size);
  const queue: number[] = [];
  for (const z of [5, 6]) {
    const gate = z * size;
    if (!occupied[gate]) { visited[gate] = 1; queue.push(gate); }
  }
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const x = at % size, z = Math.floor(at / size);
    if (x >= 4 && x <= 7 && z >= 4 && z <= 7) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
      const next = nz * size + nx;
      if (!occupied[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
    }
  }
  return false;
};

export function createApp(databasePath = ':memory:', now = () => Date.now()) {
  const app = Fastify({ logger: false });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, village_version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pair_codes(code_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), token_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS revoked_devices(device_id TEXT PRIMARY KEY REFERENCES devices(id), revoked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pair_attempts(source TEXT PRIMARY KEY, failures INTEGER NOT NULL, first_failure_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, moving_seconds INTEGER NOT NULL, theme TEXT);
    CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), started_at INTEGER NOT NULL, last_at INTEGER NOT NULL, moving_seconds INTEGER NOT NULL, day TEXT NOT NULL, materials TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, claimed_at INTEGER);
    CREATE TABLE IF NOT EXISTS trip_receipts(trip_id TEXT PRIMARY KEY REFERENCES trips(id), receipt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), day TEXT NOT NULL, tier TEXT NOT NULL, claimed_at INTEGER, UNIQUE(account_id, day, tier));
    CREATE TABLE IF NOT EXISTS inventory(account_id TEXT NOT NULL REFERENCES accounts(id), material TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), PRIMARY KEY(account_id, material));
    CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), recipe TEXT NOT NULL, x INTEGER, z INTEGER, rotation INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS requests(account_id TEXT NOT NULL REFERENCES accounts(id), key TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(account_id, key));
    CREATE TABLE IF NOT EXISTS garden_harvests(account_id TEXT NOT NULL REFERENCES accounts(id), day TEXT NOT NULL, harvested_at INTEGER NOT NULL, PRIMARY KEY(account_id, day));
    CREATE TABLE IF NOT EXISTS quest_claims(account_id TEXT NOT NULL REFERENCES accounts(id), quest_id TEXT NOT NULL, claimed_at INTEGER NOT NULL, PRIMARY KEY(account_id, quest_id));
    CREATE TABLE IF NOT EXISTS village_progress(account_id TEXT PRIMARY KEY REFERENCES accounts(id), grid_size INTEGER NOT NULL DEFAULT 12 CHECK(grid_size IN (12,16,20)));
    CREATE TABLE IF NOT EXISTS scenery_earnings(account_id TEXT NOT NULL REFERENCES accounts(id), source TEXT NOT NULL, theme TEXT NOT NULL CHECK(theme IN ('city','forest','sea')), PRIMARY KEY(account_id,source));
    CREATE TABLE IF NOT EXISTS scenery_unlocks(account_id TEXT NOT NULL REFERENCES accounts(id), theme TEXT NOT NULL CHECK(theme IN ('city','forest','sea')), PRIMARY KEY(account_id,theme));
    CREATE TABLE IF NOT EXISTS item_styles(item_id TEXT PRIMARY KEY REFERENCES items(id), theme TEXT NOT NULL CHECK(theme IN ('city','forest','sea')));
    CREATE TABLE IF NOT EXISTS resident_unlocks(account_id TEXT NOT NULL REFERENCES accounts(id), resident_id TEXT NOT NULL, PRIMARY KEY(account_id, resident_id));
  `);
  // Existing villages retain the scenery rewards attached to already completed quests.
  db.exec(`INSERT OR IGNORE INTO scenery_earnings(account_id,source,theme)
    SELECT account_id, 'quest:' || quest_id,
      CASE quest_id WHEN 'q01' THEN 'city' WHEN 'q02' THEN 'forest' ELSE 'sea' END
    FROM quest_claims WHERE quest_id IN ('q01','q02','q06')`);
  const hash = (v: string) => createHash('sha256').update(v).digest('hex');
  const token = () => randomBytes(32).toString('base64url');
  const day = (millis: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(millis));
  const dayStart = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
  const grantMaterials = (tier: string): Record<Material, number> => tier === 'base'
    ? { wood: 8, stone: 6, fabric: 4, seed: 2 }
    : { wood: 4, stone: 3, fabric: 2, seed: 1 };

  function account(authorization: unknown, role: 'mobile' | 'car'): string | null {
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
    const h = hash(authorization.slice(7));
    const row = role === 'mobile'
      ? db.prepare('SELECT id FROM accounts WHERE token_hash=?').get(h) as { id: string } | undefined
      : db.prepare('SELECT account_id AS id FROM devices WHERE token_hash=? AND NOT EXISTS (SELECT 1 FROM revoked_devices WHERE device_id=devices.id)').get(h) as { id: string } | undefined;
    return row?.id ?? null;
  }
  function auth(request: { headers: { authorization?: string } }, reply: { code: (n: number) => { send: (v: unknown) => unknown } }, role: 'mobile' | 'car' = 'mobile') {
    const id = account(request.headers.authorization, role);
    if (!id) reply.code(401).send({ error: 'UNAUTHORIZED' });
    return id;
  }
  function inventory(id: string) {
    const result: Record<Material, number> = { wood: 0, stone: 0, fabric: 0, seed: 0 };
    for (const row of db.prepare('SELECT material, quantity FROM inventory WHERE account_id=?').all(id) as { material: Material; quantity: number }[]) result[row.material] = row.quantity;
    return result;
  }
  function gridSize(id: string): number {
    return (db.prepare('SELECT grid_size FROM village_progress WHERE account_id=?').get(id) as { grid_size: number } | undefined)?.grid_size ?? 12;
  }
  function questProgress(id: string) {
    const placed = db.prepare('SELECT recipe FROM items WHERE account_id=? AND x IS NOT NULL AND z IS NOT NULL').all(id) as { recipe: string }[];
    const placedSet = new Set(placed.map(item => item.recipe));
    const harvestDays = (db.prepare('SELECT COUNT(*) AS total FROM garden_harvests WHERE account_id=?').get(id) as { total: number }).total;
    const claimed = new Set((db.prepare('SELECT quest_id FROM quest_claims WHERE account_id=?').all(id) as { quest_id: string }[]).map(row => row.quest_id));
    const complete = (quest: Quest) => {
      switch (quest.condition.kind) {
        case 'placed': return placedSet.has(String(quest.condition.value));
        case 'garden_days': return harvestDays >= Number(quest.condition.value);
        case 'distinct_items': return placedSet.size >= Number(quest.condition.value);
      }
    };
    return quests.map(quest => ({ id: quest.id, name: quest.name, description: quest.description,
      claimed: claimed.has(quest.id), available: !claimed.has(quest.id) && (!quest.requires || claimed.has(quest.requires)) && complete(quest) }));
  }
  const themes = ['city', 'forest', 'sea'] as const;
  function scenery(id: string) {
    return themes.map(theme => {
      const earned = (db.prepare('SELECT COUNT(*) AS n FROM scenery_earnings WHERE account_id=? AND theme=?').get(id, theme) as { n: number }).n;
      const unlocked = !!db.prepare('SELECT 1 FROM scenery_unlocks WHERE account_id=? AND theme=?').get(id, theme);
      return { theme, fragments: earned - (unlocked ? 1 : 0), unlocked };
    });
  }
  function state(id: string) {
    const villageVersion = (db.prepare('SELECT village_version FROM accounts WHERE id=?').get(id) as { village_version: number }).village_version;
    const currentDay = day(now());
    return {
      inventory: inventory(id), villageVersion, gridSize: gridSize(id), scenery: scenery(id),
      items: db.prepare('SELECT items.id, recipe, x, z, rotation, item_styles.theme AS style FROM items LEFT JOIN item_styles ON item_styles.item_id=items.id WHERE account_id=? ORDER BY items.rowid').all(id),
      grants: (db.prepare('SELECT id, day, tier, claimed_at FROM grants WHERE account_id=? ORDER BY day, tier').all(id) as { id: string; day: string; tier: string; claimed_at: number | null }[])
        .map(grant => ({ ...grant, materials: grantMaterials(grant.tier) }))
        .concat((db.prepare('SELECT id,day,claimed_at,materials FROM collections WHERE account_id=? AND closed=1 ORDER BY started_at').all(id) as { id: string; day: string; claimed_at: number | null; materials: string }[])
          .map(row => ({ ...row, tier: 'collection', materials: JSON.parse(row.materials) }))
          .filter(grant => Object.values(grant.materials).some(quantity => Number(quantity) > 0))),
      journeys: db.prepare('SELECT id, started_at, ended_at, moving_seconds, theme FROM trips WHERE account_id=? ORDER BY ended_at DESC, rowid DESC LIMIT 5').all(id),
      garden: { harvestedToday: !!db.prepare('SELECT 1 FROM garden_harvests WHERE account_id=? AND day=?').get(id, currentDay),
        harvestDays: (db.prepare('SELECT COUNT(*) AS total FROM garden_harvests WHERE account_id=?').get(id) as { total: number }).total },
      quests: questProgress(id),
      residents: ['botta', ...(db.prepare('SELECT resident_id FROM resident_unlocks WHERE account_id=? ORDER BY rowid').all(id) as { resident_id: string }[]).map(row => row.resident_id)],
    };
  }
  const error = (reply: any, status: number, code: string) => reply.code(status).send({ error: code });
  const onlyFields = (body: unknown, allowed: readonly string[]) =>
    body !== null && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every(key => allowed.includes(key));

  app.get('/health', () => ({ ok: true }));
  app.get('/v1/content', (request, reply) => {
    if (!auth(request, reply)) return;
    return { version: 2, catalog, quests, residents, styles: [{ theme: 'city', name: '도시의 살구빛' }, { theme: 'forest', name: '숲의 초록빛' }, { theme: 'sea', name: '바다의 푸른빛' }] };
  });
  app.post('/v1/guest', (_request, reply) => {
    const id = randomUUID(); const bearer = token();
    db.transaction(() => {
      db.prepare('INSERT INTO accounts(id, token_hash) VALUES(?,?)').run(id, hash(bearer));
      const insert = db.prepare('INSERT INTO inventory(account_id, material, quantity) VALUES(?,?,?)');
      for (const material of materials) insert.run(id, material, material === 'wood' ? 4 : material === 'stone' ? 1 : 0);
    })();
    return reply.code(201).send({ accountId: id, token: bearer });
  });
  app.post('/v1/pair-code', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    db.prepare('INSERT INTO pair_codes(code_hash, account_id, expires_at) VALUES(?,?,?)').run(hash(code), id, now() + 5 * 60_000);
    return { code, expiresAt: now() + 5 * 60_000 };
  });
  app.post('/v1/pair', (request, reply) => {
    const body = request.body as { code?: unknown } | null;
    if (!onlyFields(body, ['code']) || !body || typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) return error(reply, 400, 'INVALID_CODE');
    const source = request.ip;
    const attempt = db.prepare('SELECT failures, first_failure_at FROM pair_attempts WHERE source=?').get(source) as { failures: number; first_failure_at: number } | undefined;
    if (attempt && now() - attempt.first_failure_at < 600_000 && attempt.failures >= 5) return error(reply, 429, 'PAIR_RATE_LIMITED');
    const result = db.transaction(() => {
      const row = db.prepare('SELECT account_id, expires_at, used_at FROM pair_codes WHERE code_hash=?').get(hash(body.code as string)) as { account_id: string; expires_at: number; used_at: number | null } | undefined;
      if (!row || row.used_at || row.expires_at < now()) {
        if (!attempt || now() - attempt.first_failure_at >= 600_000) {
          db.prepare('INSERT INTO pair_attempts(source,failures,first_failure_at) VALUES(?,1,?) ON CONFLICT(source) DO UPDATE SET failures=1,first_failure_at=excluded.first_failure_at').run(source, now());
        } else db.prepare('UPDATE pair_attempts SET failures=failures+1 WHERE source=?').run(source);
        return null;
      }
      const bearer = token(); const deviceId = randomUUID();
      db.prepare('UPDATE pair_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL').run(now(), hash(body.code as string));
      db.prepare('INSERT INTO devices(id, account_id, token_hash) VALUES(?,?,?)').run(deviceId, row.account_id, hash(bearer));
      db.prepare('DELETE FROM pair_attempts WHERE source=?').run(source);
      return { deviceId, accountId: row.account_id, token: bearer };
    })();
    return result ?? error(reply, 409, 'CODE_UNAVAILABLE');
  });
  app.get('/v1/devices', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    return { devices: db.prepare('SELECT id FROM devices WHERE account_id=? AND NOT EXISTS (SELECT 1 FROM revoked_devices WHERE device_id=devices.id) ORDER BY rowid').all(id) };
  });
  app.delete('/v1/devices/:deviceId', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const deviceId = (request.params as { deviceId: string }).deviceId;
    const device = db.prepare('SELECT id FROM devices WHERE id=? AND account_id=?').get(deviceId, id);
    if (!device) return error(reply, 404, 'DEVICE_NOT_FOUND');
    db.prepare('INSERT OR IGNORE INTO revoked_devices(device_id, revoked_at) VALUES(?,?)').run(deviceId, now());
    return { revoked: true };
  });
  app.get('/v1/state', (request, reply) => { const id = auth(request, reply); return id ? state(id) : undefined; });
  app.post('/v1/garden/harvest', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    if (request.body != null && !onlyFields(request.body, [])) return error(reply, 400, 'INVALID_HARVEST');
    const date = day(now());
    const harvested = db.transaction(() => {
      const inserted = db.prepare('INSERT OR IGNORE INTO garden_harvests(account_id,day,harvested_at) VALUES(?,?,?)').run(id, date, now());
      if (!inserted.changes) return false;
      for (const [material, amount] of Object.entries({ wood: 8, stone: 6, fabric: 4, seed: 3 }))
        db.prepare('UPDATE inventory SET quantity=quantity+? WHERE account_id=? AND material=?').run(amount, id, material);
      return true;
    })();
    return { ...state(id), harvested };
  });
  app.post('/v1/quests/:questId/claim', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    if (request.body != null && !onlyFields(request.body, [])) return error(reply, 400, 'INVALID_QUEST_CLAIM');
    const questId = (request.params as { questId: string }).questId;
    const quest = quests.find(entry => entry.id === questId);
    if (!quest) return error(reply, 404, 'QUEST_NOT_FOUND');
    const outcome = db.transaction(() => {
      if (db.prepare('SELECT 1 FROM quest_claims WHERE account_id=? AND quest_id=?').get(id, questId)) return 'ALREADY_CLAIMED';
      if (!questProgress(id).find(entry => entry.id === questId)?.available) return 'QUEST_INCOMPLETE';
      db.prepare('INSERT INTO quest_claims(account_id,quest_id,claimed_at) VALUES(?,?,?)').run(id, questId, now());
      for (const [material, amount] of Object.entries(quest.reward.materials ?? {}))
        db.prepare('UPDATE inventory SET quantity=quantity+? WHERE account_id=? AND material=?').run(amount, id, material);
      if (quest.reward.resident) db.prepare('INSERT OR IGNORE INTO resident_unlocks(account_id,resident_id) VALUES(?,?)').run(id, quest.reward.resident);
      if (quest.reward.gridSize) db.prepare('INSERT INTO village_progress(account_id,grid_size) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET grid_size=max(grid_size, excluded.grid_size)').run(id, quest.reward.gridSize);
      const questTheme = ({ q01: 'city', q02: 'forest', q06: 'sea' } as Record<string, string>)[questId];
      if (questTheme) db.prepare('INSERT OR IGNORE INTO scenery_earnings(account_id,source,theme) VALUES(?,?,?)').run(id, `quest:${questId}`, questTheme);
      return 'OK';
    })();
    if (outcome !== 'OK') return error(reply, 409, outcome);
    return state(id);
  });
  type Collection = { id: string; account_id: string; started_at: number; last_at: number; moving_seconds: number; day: string; materials: string; closed: number };
  type Movement = { id: string; startedAt: number; endedAt: number; movingSeconds: number };
  function collect(accountId: string, trip: Movement, close: boolean): Record<Material, number> {
    const previous = db.prepare('SELECT * FROM collections WHERE id=?').get(trip.id) as Collection | undefined;
    if (previous && (previous.account_id !== accountId || previous.started_at !== trip.startedAt)) throw new Error('COLLECTION_CONFLICT');
    if (previous?.closed) return JSON.parse(previous.materials);
    if (previous && (trip.movingSeconds < previous.moving_seconds || trip.endedAt < previous.last_at)) {
      if (close) throw new Error('STALE_COLLECTION');
      return JSON.parse(previous.materials);
    }
    if (db.prepare('SELECT id FROM collections WHERE account_id=? AND id<>? AND started_at<? AND last_at>?').get(accountId, trip.id, trip.endedAt, trip.startedAt) ||
        db.prepare('SELECT id FROM trips WHERE account_id=? AND id<>? AND started_at<? AND ended_at>?').get(accountId, trip.id, trip.endedAt, trip.startedAt)) throw new Error('TRIP_OVERLAP');
    const date = previous?.day ?? day(trip.startedAt);
    const used: Record<Material, number> = { wood: 0, stone: 0, fabric: 0, seed: 0 };
    for (const row of db.prepare('SELECT materials FROM collections WHERE account_id=? AND day=? AND id<>?').all(accountId, date, trip.id) as { materials: string }[])
      for (const material of materials) used[material] += JSON.parse(row.materials)[material];
    for (const row of db.prepare('SELECT tier FROM grants WHERE account_id=? AND day=?').all(accountId, date) as { tier: string }[])
      for (const material of materials) used[material] += grantMaterials(row.tier)[material];
    const ticks = Math.floor(trip.movingSeconds / 15);
    const desired = { wood: ticks * 2, stone: ticks, fabric: Math.floor(ticks / 2), seed: Math.floor(ticks / 2) };
    const caps = { wood: 12, stone: 9, fabric: 6, seed: 3 };
    const earned = Object.fromEntries(materials.map(material => [material, Math.min(desired[material], Math.max(0, caps[material] - used[material]))])) as Record<Material, number>;
    db.prepare(`INSERT INTO collections(id,account_id,started_at,last_at,moving_seconds,day,materials,closed) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at,moving_seconds=excluded.moving_seconds,materials=excluded.materials,closed=excluded.closed`)
      .run(trip.id, accountId, trip.startedAt, trip.endedAt, trip.movingSeconds, date, JSON.stringify(earned), close ? 1 : 0);
    return earned;
  }
  app.post('/v1/collections', (request, reply) => {
    const id = auth(request, reply, 'car'); if (!id) return;
    const b = request.body as Movement | null;
    if (!b || !onlyFields(b, ['id','startedAt','endedAt','movingSeconds']) || typeof b.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(b.id) ||
      !Number.isSafeInteger(b.startedAt) || !Number.isSafeInteger(b.endedAt) || !Number.isInteger(b.movingSeconds) ||
      b.endedAt <= b.startedAt || b.endedAt > now() + 60_000 || b.movingSeconds < 0 ||
      b.movingSeconds * 1000 > b.endedAt - b.startedAt || b.endedAt - b.startedAt > 4 * 60 * 60_000) return error(reply,400,'INVALID_COLLECTION');
    try { return { materials: db.transaction(() => collect(id, b, false))(), confirmed: true }; }
    catch (e) { return error(reply,409,(e as Error).message); }
  });
  app.post('/v1/trips', (request, reply) => {
    const id = auth(request, reply, 'car'); if (!id) return;
    const body = request.body as { id?: unknown; startedAt?: unknown; endedAt?: unknown; movingSeconds?: unknown; theme?: unknown; collection?: unknown } | null;
    if (!onlyFields(body, ['id', 'startedAt', 'endedAt', 'movingSeconds', 'theme', 'collection']) || !body || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id) ||
      !Number.isSafeInteger(body.startedAt) || !Number.isSafeInteger(body.endedAt) || !Number.isInteger(body.movingSeconds) ||
      (body.endedAt as number) <= (body.startedAt as number) || (body.endedAt as number) > now() + 60_000 ||
      (body.movingSeconds as number) < 0 || (body.movingSeconds as number) * 1000 > (body.endedAt as number) - (body.startedAt as number) ||
      (body.endedAt as number) - (body.startedAt as number) > 4 * 60 * 60_000 ||
      (body.collection != null && typeof body.collection !== 'boolean') ||
      (body.theme != null && !['city', 'forest', 'sea'].includes(String(body.theme)))) return error(reply, 400, 'INVALID_TRIP');
    const existing = db.prepare('SELECT account_id FROM trips WHERE id=?').get(body.id) as { account_id: string } | undefined;
    if (existing) return existing.account_id === id ? { accepted: true, duplicate: true } : error(reply, 409, 'TRIP_EXISTS');
    const overlap = db.prepare('SELECT 1 FROM trips WHERE account_id=? AND started_at < ? AND ended_at > ?').get(id, body.endedAt, body.startedAt);
    if (overlap) return error(reply, 409, 'TRIP_OVERLAP');
    try { db.transaction(() => {
      const live = body.collection === true || !!db.prepare('SELECT id FROM collections WHERE account_id=? LIMIT 1').get(id);
      const earned: Record<Material, number> = { wood: 0, stone: 0, fabric: 0, seed: 0 };
      let earnedScenery: string | null = null;
      db.prepare('INSERT INTO trips(id, account_id, started_at, ended_at, moving_seconds, theme) VALUES(?,?,?,?,?,?)')
        .run(body.id, id, body.startedAt, body.endedAt, body.movingSeconds, body.theme ?? null);
      // One scenery fragment total per arrival day, shared across themes and vehicles.
      if (body.theme && (body.movingSeconds as number) > 0) {
        const inserted = db.prepare('INSERT OR IGNORE INTO scenery_earnings(account_id,source,theme) VALUES(?,?,?)')
          .run(id, `trip:${day(body.endedAt as number)}`, body.theme);
        if (inserted.changes) earnedScenery = String(body.theme);
      }
      if (live) Object.assign(earned, collect(id, body as Movement, true));
      else for (const date of new Set([day(body.startedAt as number), day((body.endedAt as number) - 1)])) {
        const start = dayStart(date);
        const end = start + 86_400_000;
        const rows = db.prepare('SELECT started_at, ended_at, moving_seconds FROM trips WHERE account_id=? AND started_at<? AND ended_at>?')
          .all(id, end, start) as { started_at: number; ended_at: number; moving_seconds: number }[];
        // A trip summary has no per-second timeline. Split its valid movement conservatively
        // by the wall-clock overlap, so crossing midnight cannot credit both full days.
        const total = rows.reduce((seconds, row) => {
          const overlap = Math.max(0, Math.min(row.ended_at, end) - Math.max(row.started_at, start));
          return seconds + row.moving_seconds * overlap / (row.ended_at - row.started_at);
        }, 0);
        for (const [tier, threshold] of [['base', 300], ['extra', 900]] as const) {
          if (total >= threshold) {
            const inserted = db.prepare('INSERT OR IGNORE INTO grants(id, account_id, day, tier) VALUES(?,?,?,?)').run(randomUUID(), id, date, tier);
            if (inserted.changes) for (const material of materials) earned[material] += grantMaterials(tier)[material];
          }
        }
      }
      db.prepare('INSERT INTO trip_receipts(trip_id,receipt) VALUES(?,?)').run(body.id, JSON.stringify({ confirmed: true, materials: earned, scenery: earnedScenery }));
    })(); } catch (e) { return error(reply,409,(e as Error).message); }
    return reply.code(201).send({ accepted: true, duplicate: false });
  });
  // Per-trip receipt survives retries and mobile claims; never infer it from today's inventory.
  app.get('/v1/trips/:tripId/receipt', (request, reply) => {
    const id = auth(request, reply, 'car'); if (!id) return;
    const tripId = (request.params as { tripId: string }).tripId;
    const trip = db.prepare('SELECT id FROM trips WHERE id=? AND account_id=?').get(tripId, id);
    if (!trip) return error(reply, 404, 'TRIP_NOT_FOUND');
    const row = db.prepare('SELECT receipt FROM trip_receipts WHERE trip_id=?').get(tripId) as { receipt: string } | undefined;
    // Older trips have no attributable receipt. Unknown must not be presented as zero earned.
    return row ? JSON.parse(row.receipt) : { confirmed: false, materials: {}, scenery: null };
  });
  app.post('/v1/grants/:grantId/claim', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    if (request.body != null && !onlyFields(request.body, [])) return error(reply, 400, 'INVALID_CLAIM');
    const grantId = (request.params as { grantId: string }).grantId;
    const grant = db.prepare('SELECT tier, claimed_at FROM grants WHERE id=? AND account_id=?').get(grantId, id) as { tier: string; claimed_at: number | null } | undefined;
    if (!grant) {
      const bag = db.prepare('SELECT materials,claimed_at FROM collections WHERE id=? AND account_id=? AND closed=1').get(grantId, id) as { materials: string; claimed_at: number | null } | undefined;
      if (!bag) return error(reply,404,'GRANT_NOT_FOUND');
      db.transaction(() => {
        if (db.prepare('UPDATE collections SET claimed_at=? WHERE id=? AND account_id=? AND claimed_at IS NULL').run(now(), grantId, id).changes) {
          const amounts = JSON.parse(bag.materials);
          for (const material of materials) db.prepare('UPDATE inventory SET quantity=quantity+? WHERE account_id=? AND material=?').run(amounts[material], id, material);
        }
      })();
      return state(id);
    }
    db.transaction(() => {
      const update = db.prepare('UPDATE grants SET claimed_at=? WHERE id=? AND account_id=? AND claimed_at IS NULL').run(now(), grantId, id);
      if (update.changes) {
        for (const material of materials) db.prepare('UPDATE inventory SET quantity=quantity+? WHERE account_id=? AND material=?').run(grantMaterials(grant.tier)[material], id, material);
      }
    })();
    return state(id);
  });
  app.post('/v1/styles/:theme/unlock', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const theme = (request.params as { theme: string }).theme;
    if (!themes.includes(theme as typeof themes[number]) || (request.body != null && !onlyFields(request.body, []))) return error(reply, 400, 'INVALID_STYLE');
    const outcome = db.transaction(() => {
      const balance = scenery(id).find(entry => entry.theme === theme)!;
      if (balance.unlocked) return 'OK';
      if (balance.fragments < 1) return 'INSUFFICIENT_FRAGMENTS';
      db.prepare('INSERT INTO scenery_unlocks(account_id,theme) VALUES(?,?)').run(id, theme);
      return 'OK';
    })();
    return outcome === 'OK' ? state(id) : error(reply, 409, outcome);
  });
  app.post('/v1/items/:itemId/style', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const itemId = (request.params as { itemId: string }).itemId;
    const body = request.body as { theme?: unknown; villageVersion?: unknown } | null;
    if (!body || !onlyFields(body, ['theme', 'villageVersion']) || !themes.includes(body.theme as typeof themes[number]) || !Number.isInteger(body.villageVersion)) return error(reply, 400, 'INVALID_STYLE');
    const outcome = db.transaction(() => {
      if (!db.prepare('SELECT 1 FROM items WHERE id=? AND account_id=?').get(itemId, id)) return 'NOT_FOUND';
      if (!db.prepare('SELECT 1 FROM scenery_unlocks WHERE account_id=? AND theme=?').get(id, body.theme)) return 'STYLE_LOCKED';
      const version = (db.prepare('SELECT village_version FROM accounts WHERE id=?').get(id) as { village_version: number }).village_version;
      if (version !== body.villageVersion) return 'STALE';
      db.prepare('INSERT INTO item_styles(item_id,theme) VALUES(?,?) ON CONFLICT(item_id) DO UPDATE SET theme=excluded.theme').run(itemId, body.theme);
      db.prepare('UPDATE accounts SET village_version=village_version+1 WHERE id=?').run(id);
      return 'OK';
    })();
    return outcome === 'OK' ? state(id) : error(reply, outcome === 'NOT_FOUND' ? 404 : 409, outcome);
  });
  app.post('/v1/craft', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const body = request.body as { recipe?: unknown; requestId?: unknown } | null;
    if (!onlyFields(body, ['recipe', 'requestId']) || !body || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId) || typeof body.recipe !== 'string' || !Object.hasOwn(recipes, body.recipe)) return error(reply, 400, 'INVALID_CRAFT');
    const result = db.transaction(() => {
      const previous = db.prepare('SELECT response FROM requests WHERE account_id=? AND key=?').get(id, body.requestId) as { response: string } | undefined;
      if (previous) return JSON.parse(previous.response);
      const cost = recipes[body.recipe as string];
      const current = inventory(id);
      if (materials.some(material => current[material] < (cost[material] ?? 0))) return null;
      for (const material of materials) if (cost[material]) db.prepare('UPDATE inventory SET quantity=quantity-? WHERE account_id=? AND material=?').run(cost[material], id, material);
      const itemId = randomUUID();
      db.prepare('INSERT INTO items(id, account_id, recipe) VALUES(?,?,?)').run(itemId, id, body.recipe);
      const response = { itemId, recipe: body.recipe };
      db.prepare('INSERT INTO requests(account_id, key, response) VALUES(?,?,?)').run(id, body.requestId, JSON.stringify(response));
      return response;
    })();
    return result ?? error(reply, 409, 'INSUFFICIENT_MATERIALS');
  });
  app.post('/v1/items/:itemId/place', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const body = request.body as { x?: unknown; z?: unknown; rotation?: unknown; villageVersion?: unknown } | null;
    const itemId = (request.params as { itemId: string }).itemId;
    if (!onlyFields(body, ['x', 'z', 'rotation', 'villageVersion']) || !body || !Number.isInteger(body.x) || !Number.isInteger(body.z) || ![0, 90, 180, 270].includes(body.rotation as number) || !Number.isInteger(body.villageVersion) ||
      (body.x as number) < 0 || (body.z as number) < 0) return error(reply, 400, 'INVALID_PLACEMENT');
    const outcome = db.transaction(() => {
      const item = db.prepare('SELECT id,recipe FROM items WHERE id=? AND account_id=?').get(itemId, id) as { id: string; recipe: string } | undefined;
      if (!item) return 'NOT_FOUND';
      const current = (db.prepare('SELECT village_version FROM accounts WHERE id=?').get(id) as { village_version: number }).village_version;
      if (current !== body.villageVersion) return 'STALE';
      const candidate = { x: body.x as number, z: body.z as number, recipe: item.recipe, rotation: body.rotation as number };
      const [width, height] = footprint(item.recipe, candidate.rotation);
      const size = gridSize(id);
      if (candidate.x + width > size || candidate.z + height > size) return 'OUT_OF_BOUNDS';
      const placed = db.prepare('SELECT id,recipe,x,z,rotation FROM items WHERE account_id=? AND x IS NOT NULL AND z IS NOT NULL AND id<>?')
        .all(id, itemId) as { id: string; recipe: string; x: number; z: number; rotation: number }[];
      if (placed.some(other => intersects(candidate, other))) return 'OCCUPIED';
      if (!entranceReachable(size, [...placed, candidate])) return 'ENTRANCE_BLOCKED';
      db.prepare('UPDATE items SET x=?, z=?, rotation=? WHERE id=?').run(body.x, body.z, body.rotation, itemId);
      db.prepare('UPDATE accounts SET village_version=village_version+1 WHERE id=?').run(id);
      return 'OK';
    })();
    if (outcome !== 'OK') return error(reply, outcome === 'NOT_FOUND' ? 404 : outcome === 'OUT_OF_BOUNDS' ? 400 : 409, outcome);
    return state(id);
  });
  app.post('/v1/items/:itemId/store', (request, reply) => {
    const id = auth(request, reply); if (!id) return;
    const body = request.body as { villageVersion?: unknown } | null;
    const itemId = (request.params as { itemId: string }).itemId;
    if (!onlyFields(body, ['villageVersion']) || !body || !Number.isInteger(body.villageVersion)) return error(reply, 400, 'INVALID_STORAGE');
    const outcome = db.transaction(() => {
      const item = db.prepare('SELECT id FROM items WHERE id=? AND account_id=?').get(itemId, id);
      if (!item) return 'NOT_FOUND';
      const current = (db.prepare('SELECT village_version FROM accounts WHERE id=?').get(id) as { village_version: number }).village_version;
      if (current !== body.villageVersion) return 'STALE';
      db.prepare('UPDATE items SET x=NULL, z=NULL WHERE id=?').run(itemId);
      db.prepare('UPDATE accounts SET village_version=village_version+1 WHERE id=?').run(id);
      return 'OK';
    })();
    if (outcome !== 'OK') return error(reply, outcome === 'NOT_FOUND' ? 404 : 409, outcome);
    return state(id);
  });

  return { app, db };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { app } = createApp(process.env.LETS_PLEO_DB ?? './lets-pleo.sqlite');
  app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 4187) }).catch(error => { console.error(error); process.exit(1); });
}
