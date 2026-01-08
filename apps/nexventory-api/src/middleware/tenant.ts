// Placeholder for tenant resolution middleware
export const tenantMiddleware = async (request, reply) => {
    console.log('Tenant middleware executing...');
    // const config = getConfig();

    // 1. Resolve tenantId based on config.TENANT_MODE
    // if (config.TENANT_MODE === 'FIXED') {
    //   request.tenantId = config.FIXED_TENANT_ID;
    // } else if (config.TENANT_MODE === 'DYNAMIC') {
    //   // Extract tenant from subdomain, request.user.tenantId (if present from SSO), or custom header
    //   request.tenantId = request.user?.tenantId || 'dynamic-tenant-resolved';
    // }

    // 2. Ensure user (if authenticated) has access to this tenantId
    // if (request.user && request.tenantId && request.user.tenantId !== request.tenantId) {
    //   reply.code(403).send({ message: 'Access denied for tenant' });
    //   return;
    // }

    // if (!request.tenantId) {
    //   reply.code(400).send({ message: 'Tenant could not be resolved' });
    //   return;
    // }
};
