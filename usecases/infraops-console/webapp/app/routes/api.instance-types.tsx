import type { LoaderFunctionArgs } from '@remix-run/node';
import { ec2Client } from '~/utils/aws.server';
import { requireAuthentication } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Authentication check
  await requireAuthentication(request);

  try {
      const filters = [{
          Name: 'location',
          Values: [process.env.AWS_REGION!]
        }];

      const { InstanceTypeOfferings } = await ec2Client.describeInstanceTypeOfferings({ filters }, request);

      // Extract only instance type names
      const instanceTypes = InstanceTypeOfferings?.map(type => type.InstanceType || '') || [];

      // Sort instance types by name
      instanceTypes.sort();

      // Also get list of available instance families
      const families = Array.from(new Set(instanceTypes.map(type => type.split('.')[0])));
      families.sort();

      return { instanceTypes, families };
  } catch (error) {
    console.error('Error fetching instance types:', error);
    return { error: 'Failed to fetch instance types' };
  }
}
