import { z } from 'zod';

export const GITHUB_AUTH_API = {
  device: '/api/auth/github/device',
  poll: '/api/auth/github/device/poll',
} as const;

export const githubDeviceCodeSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.url(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive(),
});

export const githubDevicePollBodySchema = z.object({
  deviceCode: z.string().min(1),
  interval: z.number().int().positive(),
});

const githubPendingSchema = z.object({
  status: z.literal('pending'),
  interval: z.number().int().positive(),
});

const githubSlowDownSchema = z.object({
  status: z.literal('slow_down'),
  interval: z.number().int().positive(),
});

const githubExpiredSchema = z.object({ status: z.literal('expired') });
const githubDeniedSchema = z.object({ status: z.literal('denied') });

const githubAuthorizedSchema = z.object({
  status: z.literal('authorized'),
  credential: z.object({
    accessToken: z.string().min(1),
    tokenType: z.string().min(1),
    scope: z.string(),
    refreshToken: z.string().min(1).optional(),
    expiresIn: z.number().int().positive().optional(),
    refreshTokenExpiresIn: z.number().int().positive().optional(),
  }),
  user: z.object({
    login: z.string().min(1),
    id: z.number().int().nonnegative(),
  }),
});

export const githubDevicePollResponseSchema = z.discriminatedUnion('status', [
  githubPendingSchema,
  githubSlowDownSchema,
  githubExpiredSchema,
  githubDeniedSchema,
  githubAuthorizedSchema,
]);

export type GitHubDeviceCode = z.infer<typeof githubDeviceCodeSchema>;
export type GitHubDevicePollBody = z.infer<typeof githubDevicePollBodySchema>;
export type GitHubDevicePollResponse = z.infer<typeof githubDevicePollResponseSchema>;
