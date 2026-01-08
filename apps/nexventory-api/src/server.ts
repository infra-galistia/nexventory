import Fastify from 'fastify';
// import { getConfig } from '@nexventory/config';
// import { authMiddleware } from './middleware/auth';
// import { tenantMiddleware } from './middleware/tenant';
// import { authorizeMiddleware } from './middleware/authorize';

const server = Fastify({ logger: true });

// const config = getConfig();
console.log('API Server starting with profile...'); //, config.profile

// 1. Register middleware
// server.addHook('preHandler', authMiddleware);
// server.addHook('preHandler', tenantMiddleware);
// server.addHook('preHandler', authorizeMiddleware);

// 2. Define routes
server.get('/api/inventory', async (request, reply) => {
  // This is where you'd use the middleware-injected properties
  // const user = request.user;
  // authorize(user, 'read', 'inventory');
  // const inventory = db.getInventory(user.tenantId);
  console.log('Received request for /api/inventory');
  return { data: [{id: 1, name: 'Sample Item'}] };
});

server.get('/', async (request, reply) => {
  return { status: 'API is running' };
})

const start = async () => {
  try {
    await server.listen({ port: 3001 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
