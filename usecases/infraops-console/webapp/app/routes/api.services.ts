/**
 * API Route for ECS Service Management
 * 
 * This file serves as a Remix API route that enables frontend components
 * to call backend functionality without page navigation.
 * 
 * Provides endpoints for managing ECS service operations
 * such as updating desired task counts without page transitions.
 * 
 * - action: Handles POST/PUT/DELETE requests (service manipulation)
 * 
 * Business logic is delegated to functions in the models/ecs.server.ts file.
 * This file only handles authentication checks and parameter passing.
 * 
 * Frontend usage examples:
 * - useFetcher().submit(formData, { method: "post", action: "/api/services" })
 */

import { ActionFunctionArgs } from '@remix-run/node';
import { handleServiceAction } from '../models/ecs.server';
import { requireAuthentication } from '../utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  // Authentication check
  await requireAuthentication(request);

  // Extract form data and convert to parameters object
  const formData = await request.formData();
  const params = Object.fromEntries(formData);
  const action = params.action as string;

  // Delegate business logic to models layer
  return await handleServiceAction(action, params, request);
}
