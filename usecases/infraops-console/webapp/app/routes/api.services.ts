import { ActionFunctionArgs, json } from '@remix-run/node';
import { ecsClient } from '~/utils/aws.server';
import { requireAuthentication } from '~/utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  // Authentication check
  await requireAuthentication(request)

  // Get form data
  const formData = await request.formData();
  const action = formData.get('action') as string;
  
  if (action === 'updateDesiredCount') {
    const clusterArn = formData.get('clusterArn') as string;
    const serviceArn = formData.get('serviceArn') as string;
    const desiredCount = parseInt(formData.get('desiredCount') as string, 10);
    
    try {
      await ecsClient.updateServiceDesiredCount({
        cluster: clusterArn,
        service: serviceArn,
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
