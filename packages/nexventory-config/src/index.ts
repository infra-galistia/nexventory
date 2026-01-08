import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

const configSchema = z.object({
  DEPLOYMENT_PROFILE: z.enum(['GALISTIA_SAAS', 'OLDS_COLLEGE']),
  IDENTITY_PROVIDER: z.enum(['FIREBASE', 'OIDC']),
  DATABASE_PROVIDER: z.enum(['FIRESTORE', 'POSTGRES']),
  TENANT_MODE: z.enum(['DYNAMIC', 'FIXED']),
  FIXED_TENANT_ID: z.string().optional(),
});

let validatedConfig: z.infer<typeof configSchema>;

export function getConfig() {
  if (validatedConfig) {
    return validatedConfig;
  }

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration.');
  }
  
  validatedConfig = result.data;
  return validatedConfig;
}
