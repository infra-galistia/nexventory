import { User } from '@nexventory/core/domain/user';

type Action = 'read' | 'write' | 'create' | 'delete';
type Resource = 'inventory' | 'user' | 'organization';

/**
 * A placeholder for a real authorization system (like Casbin or Oso).
 * For now, it's a simple role-based check.
 */
export function authorize(user: User, action: Action, resource: Resource): boolean {
    console.log(`Authorizing user ${user.id} for action ${action} on resource ${resource}`);
    if (user.roles.includes('admin')) {
        return true;
    }

    if (resource === 'inventory' && action === 'read' && user.roles.includes('user')) {
        return true;
    }

    // Deny by default
    return false;
}

export function assignInitialRole(isFirstUserOfTenant: boolean): string[] {
    return isFirstUserOfTenant ? ['owner', 'admin'] : ['user'];
}
