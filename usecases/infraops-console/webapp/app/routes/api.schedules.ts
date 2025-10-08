/**
 * API Route for EC2 Instance Schedule Management
 * 
 * This file serves as a Remix API route that enables frontend components
 * to call backend functionality without page navigation.
 * 
 * Provides endpoints for managing EC2 instance start/stop schedules
 * using AWS EventBridge Scheduler without page transitions.
 * 
 * - loader: Handles GET requests (schedule data fetching)
 * - action: Handles POST/PUT/DELETE requests (schedule manipulation)
 * 
 * Business logic is delegated to functions in the models/scheduler.server.ts file.
 * This file only handles authentication checks and parameter passing.
 * 
 * Frontend usage examples:
 * - useFetcher().load("/api/schedules?instanceId=xxx")
 * - useFetcher().submit(formData, { method: "post", action: "/api/schedules" })
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { getSchedulesByInstanceId, handleScheduleAction } from '../models/scheduler.server';
import { requireAuthentication } from '../utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Authentication check
  await requireAuthentication(request);

  // Get instance ID from query parameters
  const url = new URL(request.url);
  const instanceId = url.searchParams.get('instanceId');

  // Delegate business logic to models layer
  return await getSchedulesByInstanceId(instanceId, request);
}

export async function action({ request }: ActionFunctionArgs) {
  // Authentication check
  await requireAuthentication(request);

  // Extract form data and convert to parameters object
  const formData = await request.formData();
  const params = Object.fromEntries(formData);
  const actionType = params.actionType as string;

  // Delegate business logic to models layer
  return await handleScheduleAction(actionType, params, request);
}
