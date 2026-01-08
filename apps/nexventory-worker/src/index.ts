import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { assignInitialRole } from '@nexventory/policy';
import { getConfig } from '@nexventory/config';
import { FirestoreAdapter } from '@nexventory/db/adapters/firestore'; // Assuming Firestore for initial check
import { FirebaseAuthAdapter } from '@nexventory/identity/adapters/firebase';

admin.initializeApp();

exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    console.log(`New user created: ${user.uid}, email: ${user.email}`);
    
    // Initialize services
    const db = new FirestoreAdapter(); // Or get from a factory based on config
    const identity = new FirebaseAuthAdapter(); // Or get from a factory based on config

    try {
        // 1. Determine the tenantId for the new user.
        // For standalone, it's fixed. For SaaS, it might be from a custom signup flow or inferred.
        // For this skeleton, we'll use a placeholder or derive from a mock config.
        const config = getConfig(); // Worker functions can also use config
        let tenantId = config.TENANT_MODE === 'FIXED' ? config.FIXED_TENANT_ID : 'dynamic-tenant-placeholder';

        // In a real scenario, check if this user's email domain maps to an existing tenant
        // or if it's a completely new tenant.

        // 2. Check if this is the first user for that tenant (mock check)
        // This would involve a proper DB query (e.g., db.getUsersInTenant(tenantId))
        const existingUsersInTenant = []; // await db.getUsersInTenant(tenantId);
        const isFirstUser = existingUsersInTenant.length === 0;

        // 3. Get the initial roles.
        const roles = assignInitialRole(isFirstUser);
        console.log(`Assigning roles: ${roles.join(',')} for tenant: ${tenantId}`);

        // 4. Set custom claims.
        await identity.setRole(user.uid, roles[0]); // Simplified: just setting the first role from the array
        await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, roles, tenantId });
        console.log(`Custom claims set for user ${user.uid}: tenantId=${tenantId}, roles=${roles.join(',')}`);

    } catch (error) {
        console.error(`Error processing new user ${user.uid}:`, error);
    }
    
    return;
});
