export interface User {
    id: string;
    email: string;
    tenantId: string;
    roles: string[];
    name?: string;
}
