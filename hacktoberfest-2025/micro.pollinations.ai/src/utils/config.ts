import { config } from 'dotenv';
import { z } from 'zod';
import type { ServiceConfig, EmailConfig } from '../types/index.js';

// Load environment variables
config();

// Environment schema validation
const EnvSchema = z.object({
  PORT: z.string().transform(Number).default(() => 3000),
  NODE_ENV: z.string().default('development'),
  EMAIL_PROVIDER: z.enum(['brevo', 'resend']).default('brevo'),
  BREVO_KEY: z.string().optional(),
  BREVO_MAIL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default('Pollinations AI'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@pollinations.ai'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

const env = EnvSchema.parse(process.env);

// Create email configuration based on provider
function createEmailConfig(): EmailConfig {
  const baseConfig = {
    provider: env.EMAIL_PROVIDER,
  };

  if (env.EMAIL_PROVIDER === 'brevo') {
    if (!env.BREVO_KEY || !env.BREVO_MAIL) {
      throw new Error('Brevo configuration is incomplete. Please provide BREVO_KEY and BREVO_MAIL');
    }
    
    return {
      ...baseConfig,
      brevo: {
        apiKey: env.BREVO_KEY,
        senderEmail: env.BREVO_MAIL,
      },
    };
  }

  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) {
      throw new Error('Resend configuration is incomplete. Please provide RESEND_API_KEY');
    }
    
    return {
      ...baseConfig,
      resend: {
        apiKey: env.RESEND_API_KEY,
      },
    };
  }

  throw new Error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
}

// Export configuration
export const serviceConfig: ServiceConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  email: createEmailConfig(),
  corsOrigin: env.CORS_ORIGIN,
};

export default serviceConfig;
