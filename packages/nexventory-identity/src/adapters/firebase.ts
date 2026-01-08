import { IdentityProvider } from '@nexventory/core/ports/identity';
import { User } from '@nexventory/core/domain/user';
import { getAuth } from 'firebase-admin/auth';

export class FirebaseAuthAdapter implements IdentityProvider {
    async validateToken(token: string): Promise<User | null> {
        console.log('Validating token with Firebase Auth');
        const decodedToken = await getAuth().verifyIdToken(token);
        // This is a simplified mapping. In a real scenario, you'd fetch user details
        // from your DB based on the decoded token's UID.
        return {
            id: decodedToken.uid,
            email: decodedToken.email || '',
            tenantId: decodedToken.tenantId as string || '',
            roles: (decodedToken.roles as string[]) || [],
        };
    }

    async getUserById(id: string): Promise<User | null> {
        console.log(`Getting user by ID ${id} from Firebase Auth`);
        const userRecord = await getAuth().getUser(id);
        return {
            id: userRecord.uid,
            email: userRecord.email || '',
            tenantId: userRecord.customClaims?.tenantId as string || '',
            roles: (userRecord.customClaims?.roles as string[]) || [],
        };
    }

    async setRole(userId: string, role: string): Promise<void> {
        console.log(`Setting role ${role} for user ${userId} in Firebase Auth`);
        const user = await getAuth().getUser(userId);
        const currentClaims = user.customClaims || {};
        const currentRoles = (currentClaims.roles as string[]) || [];
        if (!currentRoles.includes(role)) {
            await getAuth().setCustomUserClaims(userId, { ...currentClaims, roles: [...currentRoles, role] });
        }
    }
}
