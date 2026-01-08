// Placeholder for authorization middleware
// import { authorize } from '@nexventory/policy';

export const authorizeMiddleware = async (request, reply) => {
    console.log('Authorization middleware executing...');
    // This is a simplified example.
    // In a real app, you would determine the resource and action from the route and body.
    // Example: For a GET /api/inventory, resource='inventory', action='read'

    // const user = request.user;
    // const tenantId = request.tenantId; // Resolved tenantId

    // if (!user || !tenantId) {
    //   reply.code(401).send({ message: 'Authentication or Tenant resolution failed' });
    //   return;
    // }

    // if (!authorize(user, 'read', 'inventory')) { // Example call
    //   reply.code(403).send({ message: 'Forbidden' });
    //   return;
    // }
};
