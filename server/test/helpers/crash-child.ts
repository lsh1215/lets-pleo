import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/main.ts';

const [path, action, token, grantId] = process.argv.slice(2);
if (!path || !action || !token) throw new Error('missing crash scenario');
const { app, db } = createApp(path);
db.function('kill_process', () => process.kill(process.pid, 'SIGKILL'));
const headers = { authorization: `Bearer ${token}` };
if (action === 'claim') {
  db.exec("CREATE TEMP TRIGGER kill_during_claim AFTER UPDATE OF quantity ON inventory WHEN NEW.material='stone' BEGIN SELECT kill_process(); END");
  await app.inject({ method: 'POST', url: `/v1/grants/${grantId}/claim`, headers });
} else if (action === 'craft') {
  db.exec('CREATE TEMP TRIGGER kill_during_craft AFTER INSERT ON items BEGIN SELECT kill_process(); END');
  await app.inject({ method: 'POST', url: '/v1/craft', headers, payload: { recipe: 'bench', requestId: randomUUID() } });
} else throw new Error(`unknown crash scenario: ${action}`);
throw new Error('transaction did not hit the crash trigger');
