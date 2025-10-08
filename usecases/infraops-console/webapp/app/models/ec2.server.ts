import { ec2Client } from '../utils/aws.server';
import type { Instance, Reservation } from '@aws-sdk/client-ec2';

/**
 * EC2 instance type definition
 * Represents basic information of EC2 instance
 */
export type EC2Instance = {
  instanceId: string;
  instanceType: string;
  state: string;
  privateIpAddress?: string;
  publicIpAddress?: string;
  availabilityZone: string;
  tags: Array<{ Key: string; Value: string }>;
  launchTime?: string;
  name: string;
  groupId: string | null;
  alternativeType: string;
};

export type EC2InstanceList = {
  instances: EC2Instance[];
  nextToken?: string;
};

/**
 * Map AWS EC2 Instance to domain EC2Instance type
 * @param awsInstance AWS EC2 Instance object
 * @returns EC2Instance domain object
 */
function mapAWSInstanceToEC2Instance(awsInstance: Instance): EC2Instance {
  return {
    instanceId: awsInstance.InstanceId || '',
    instanceType: awsInstance.InstanceType || '',
    state: awsInstance.State?.Name || 'unknown',
    privateIpAddress: awsInstance.PrivateIpAddress,
    publicIpAddress: awsInstance.PublicIpAddress,
    availabilityZone: awsInstance.Placement?.AvailabilityZone || '',
    tags: awsInstance.Tags?.map(tag => ({
      Key: tag.Key || '',
      Value: tag.Value || ''
    })) || [],
    launchTime: awsInstance.LaunchTime?.toISOString(),
    name: awsInstance.Tags?.find(tag => tag.Key === 'Name')?.Value || 'No Name',
    groupId: awsInstance.Tags?.find(tag => tag.Key === 'GroupId')?.Value || null,
    alternativeType: awsInstance.Tags?.find(tag => tag.Key === 'AlternativeType')?.Value || 'Not registered'
  };
}

/**
 * Map AWS Reservations to flat list of EC2Instance objects
 * @param reservations AWS Reservations array
 * @returns Array of EC2Instance domain objects
 */
function mapReservationsToEC2Instances(reservations: Reservation[]): EC2Instance[] {
  return reservations.flatMap(reservation =>
    reservation.Instances?.map(instance => mapAWSInstanceToEC2Instance(instance)) || []
  );
}

/**
 * Get EC2 instances list
 * @param request Request object for authentication and ABAC filtering
 * @returns EC2 instances list
 */
export async function getEC2Instances(request: Request): Promise<EC2Instance[]> {
  try {
    const { Reservations } = await ec2Client.describeInstances({}, request);
    
    if (!Reservations) {
      return [];
    }
    
    return mapReservationsToEC2Instances(Reservations);
  } catch (error) {
    console.error('Error getting EC2 instances:', error);
    return [];
  }
}

/**
 * Start EC2 instance
 * @param instanceId EC2 instance ID
 * @param request Request object for authentication
 */
export async function startEC2Instance(instanceId: string, request: Request): Promise<void> {
  try {
    await ec2Client.startInstance({ instanceId }, request);
  } catch (error) {
    console.error(`Error starting EC2 instance ${instanceId}:`, error);
    throw new Error(`Failed to start EC2 instance ${instanceId}`);
  }
}

/**
 * Stop EC2 instance
 * @param instanceId EC2 instance ID
 * @param request Request object for authentication
 */
export async function stopEC2Instance(instanceId: string, request: Request): Promise<void> {
  try {
    await ec2Client.stopInstance({ instanceId }, request);
  } catch (error) {
    console.error(`Error stopping EC2 instance ${instanceId}:`, error);
    throw new Error(`Failed to stop EC2 instance ${instanceId}`);
  }
}

/**
 * Update EC2 instance alternative type tag
 * @param instanceId EC2 instance ID
 * @param alternativeType Alternative instance type
 * @param request Request object for authentication
 */
export async function updateEC2InstanceAlternativeType(
  instanceId: string, 
  alternativeType: string, 
  request: Request
): Promise<void> {
  try {
    await ec2Client.createTags({
      resourceIds: [instanceId],
      tags: [
        {
          Key: 'AlternativeType',
          Value: alternativeType
        }
      ]
    }, request);
  } catch (error) {
    console.error(`Error updating alternative type for EC2 instance ${instanceId}:`, error);
    throw new Error(`Failed to update alternative type for EC2 instance ${instanceId}`);
  }
}

/**
 * Get available EC2 instance types with error handling
 * @param request Request object for authentication
 * @returns Response object with instance types and families or error
 */
export async function getInstanceTypes(
  request: Request
): Promise<{ instanceTypes?: string[]; families?: string[]; error?: string }> {
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
