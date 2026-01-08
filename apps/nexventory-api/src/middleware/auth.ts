// Placeholder for auth middleware
// Extend FastifyRequest with user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: import('@nexventory/core/domain/user').User;
    tenantId?: string; // Add tenantId to request
  }
}

export const authMiddleware = async (request, reply) => {
    console.log('Auth middleware executing...');
    // 1. Extract token from Authorization header
    // const token = request.headers.authorization?.split(' ')[1];
    // if (!token) {
    //   reply.code(401).send({ message: 'Authorization token missing' });
    //   return;
    // }

    // 2. Get identity provider from config
    // const config = getConfig();
    // const identityProvider = new FirebaseAuthAdapter(); // Or OidcAdapter based on config
    
    // 3. Call identityProvider.validateToken(token)
    // const validatedUser = await identityProvider.validateToken(token);
    // if (!validatedUser) {
    //   reply.code(401).send({ message: 'Invalid token' });
    //   return;
    // }

    // 4. Attach user to request:
    // request.user = validatedUser;
    // request.tenantId = validatedUser.tenantId; // Set tenantId from user claims for now
};
