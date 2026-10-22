import { API_ROUTES, healthSchema, readinessSchema } from '@chat/contracts';
import { apiGet } from '@/lib/api-client';

export const getHealth = (signal?: AbortSignal) => apiGet(API_ROUTES.health, healthSchema, signal);
export const getReadiness = (signal?: AbortSignal) => apiGet(API_ROUTES.readiness, readinessSchema, signal);
