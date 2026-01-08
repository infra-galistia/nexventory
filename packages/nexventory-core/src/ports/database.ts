export interface DatabasePort {
    getUser(userId: string): Promise<any>;
    // Add other data access methods here
    // e.g., getInventoryItem(itemId: string, tenantId: string): Promise<any>;
}
