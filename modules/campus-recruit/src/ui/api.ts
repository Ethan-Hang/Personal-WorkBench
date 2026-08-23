import {
  CAMPUS_API,
  applicationViewSchema,
  applicationsResponseSchema,
  statsResponseSchema,
  type ApplicationView,
  type CreateApplicationInput,
  type CreateRoundInput,
  type StatsResponse,
  type UpdateApplicationInput,
  type UpdateRoundInput,
} from '../contract.js';
import { apiRequest as request, jsonBody as json } from '@workbench/ui';

export const fetchApplications = async (): Promise<{ applications: ApplicationView[] }> =>
  applicationsResponseSchema.parse(await request(CAMPUS_API.applications));

export const postApplication = async (input: CreateApplicationInput): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(CAMPUS_API.applications, json('POST', input)));

export const patchApplication = async (
  id: string,
  input: UpdateApplicationInput,
): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(CAMPUS_API.application(id), json('PATCH', input)));

export const postApply = async (id: string): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(CAMPUS_API.applyApplication(id), { method: 'POST' }));

export const deleteApplication = async (id: string): Promise<void> => {
  await request(CAMPUS_API.application(id), { method: 'DELETE' });
};

export const postRound = async (
  applicationId: string,
  input: CreateRoundInput,
): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(CAMPUS_API.applicationRounds(applicationId), json('POST', input)),
  );

export const patchRound = async (id: string, input: UpdateRoundInput): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(CAMPUS_API.round(id), json('PATCH', input)));

export const deleteRound = async (id: string): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(CAMPUS_API.round(id), { method: 'DELETE' }));

export const fetchStats = async (): Promise<StatsResponse> =>
  statsResponseSchema.parse(await request(CAMPUS_API.stats));
