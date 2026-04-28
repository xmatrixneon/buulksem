import { randomBytes } from 'crypto';
import { prisma } from '../db/prisma';

// Generate secure API key (sk_ + 64 hex characters)
export function generateApiKey(): string {
  return `sk_${randomBytes(32).toString('hex')}`;
}

// Generate API key for existing user
export async function generateApiKeyForUser(userId: string): Promise<string> {
  const apiKey = generateApiKey();

  // Check for uniqueness (rare collision)
  const existing = await prisma.user.findUnique({ where: { apiKey } });
  if (existing) {
    return generateApiKeyForUser(userId); // Retry with new key
  }

  await prisma.user.update({
    where: { id: userId },
    data: { apiKey }
  });

  return apiKey;
}

// Validate API key and return user
export async function validateApiKey(apiKey: string | undefined) {
  if (!apiKey) {
    return { valid: false, user: null };
  }

  const user = await prisma.user.findUnique({
    where: { apiKey }
  });

  if (!user) {
    return { valid: false, user: null };
  }

  return { valid: true, user };
}
