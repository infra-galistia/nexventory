import { DatabasePort } from '@nexventory/core/ports/database';
import { Pool } from 'pg';

export class PostgresAdapter implements DatabasePort {
    private pool: Pool;
    constructor() {
        console.log("Postgres DB Adapter Initialized. NOTE: This is a skeleton.");
        // this.pool = new Pool({
        //     connectionString: process.env.POSTGRES_URL,
        // });
    }

    async getUser(userId: string) {
        console.log(`Getting user ${userId} from Postgres`);
        // const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        // return res.rows[0];
        return { id: userId, name: "Postgres User", email: "user@postgres.com", tenantId: 'olds-college', roles: ['user'] };
    }
}
