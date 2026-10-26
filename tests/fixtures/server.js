import { createGameServer } from '../../server/index.js';

const server = await createGameServer({ database: process.env.TEST_DB, dev: process.env.TEST_DEV === '1' });
const { port } = await server.listen(0, '127.0.0.1');
process.send({ port });
process.on('message', async message => {
  if (message === 'stop') { await server.close(); process.exit(0); }
});
