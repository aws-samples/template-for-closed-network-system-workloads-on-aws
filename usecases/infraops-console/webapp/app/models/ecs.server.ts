import { ecsClient } from '~/utils/aws.server';

/**
 * ECS service type definition
 * Represents basic information of ECS service
 */
export type Service = {
  name: string;
  status: string;
  runningCount: number;
  desiredCount: number;
  clusterName: string;
  clusterArn: string;
  serviceArn: string;
}

/**
 * Get list of ECS services
 * @param request Request object for authentication
 * @returns Array of Service objects
 */
export async function getServices(request: Request): Promise<Service[]> {
  let services: Service[] = [];
  
  try {
    // Get list of ECS clusters
    const { clusterArns } = await ecsClient.listClusters(request);
    
    // Get services for each cluster
    for (const clusterArn of clusterArns || []) {
      const clusterName = clusterArn.split('/').pop() || '';
      
      // Get list of services
      const { serviceArns } = await ecsClient.listServices({ cluster: clusterArn }, request);
      
      if (serviceArns && serviceArns.length > 0) {
        const { services: serviceDetails } = await ecsClient.describeServices({
          cluster: clusterArn,
          services: serviceArns
        }, request);
        
        // Format service information
        const formattedServices = serviceDetails?.map(service => ({
          name: service.serviceName || '',
          status: service.status || '',
          runningCount: service.runningCount || 0,
          desiredCount: service.desiredCount || 0,
          clusterName,
          clusterArn,
          serviceArn: service.serviceArn || ''
        })) || [];
        
        services = [...services, ...formattedServices];
      }
    }
  } catch (error) {
    console.error('Error fetching ECS services:', error);
  }
  
  return services;
}

/**
 * Update ECS service desired count
 * @param params Service update parameters
 * @param request Request object for authentication
 */
export async function updateServiceDesiredCount(params: {
  clusterArn: string;
  serviceArn: string;
  desiredCount: number;
}, request: Request): Promise<void> {
  try {
    await ecsClient.updateServiceDesiredCount({
      cluster: params.clusterArn,
      service: params.serviceArn,
      desiredCount: params.desiredCount
    }, request);
  } catch (error) {
    console.error('Error updating service desired count:', error);
    throw new Error('Failed to update task count');
  }
}

/**
 * Handle ECS service actions with unified error handling
 * @param action Type of action to perform
 * @param params Parameters from form data
 * @param request Request object for authentication
 * @returns Response object with success/error status
 */
export async function handleServiceAction(
  action: string,
  params: Record<string, any>,
  request: Request
): Promise<{ success?: boolean; error?: string }> {
  if (action === 'updateDesiredCount') {
    const clusterArn = params.clusterArn as string;
    const serviceArn = params.serviceArn as string;
    const desiredCount = parseInt(params.desiredCount as string, 10);
    
    try {
      await updateServiceDesiredCount({
        clusterArn,
        serviceArn,
        desiredCount
      }, request);
      
      return { success: true };
    } catch (error) {
      console.error('Error updating service desired count:', error);
      return { error: 'Failed to update task count' };
    }
  }
  
  return { error: 'Invalid action' };
}
