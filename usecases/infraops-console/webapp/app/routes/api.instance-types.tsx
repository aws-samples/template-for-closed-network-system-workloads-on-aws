/**
 * API Route for EC2 Instance Type Information
 * 
 * This file serves as a Remix API route that enables frontend components
 * to call backend functionality without page navigation.
 * 
 * Provides endpoints for retrieving available EC2 instance types
 * and instance families for the current AWS region.
 * 
 * - loader: Handles GET requests (instance type data fetching)
 * 
 * Business logic is delegated to functions in the models/ec2.server.ts file.
 * This file only handles authentication checks and parameter passing.
 * 
 * Frontend usage examples:
 * - useFetcher().load("/api/instance-types")
 */

import type { LoaderFunctionArgs } from '@remix-run/node';
import { getInstanceTypes } from '../models/ec2.server';
import { requireAuthentication } from '../utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Authentication check
  await requireAuthentication(request);

  // Delegate business logic to models layer
  return await getInstanceTypes(request);
}
