import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { schedulerClient } from '~/utils/aws.server';
import { requireAuthentication } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Authentication check
  await requireAuthentication(request)

  // Get instance ID from query parameters
  const url = new URL(request.url);
  const instanceId = url.searchParams.get('instanceId');

  if (!instanceId) {
    return { error: 'Not set Intance ID' };
  }

  try {
    const schedules = await schedulerClient.listSchedulesForInstance({instanceId}, request);
    return { schedules };
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return { error: 'Failed to fetch schedules' };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  // Authentication check
  await requireAuthentication(request)

  // Get form data
  const formData = await request.formData();
  const actionType = formData.get('actionType') as string;
  const instanceId = formData.get('instanceId') as string;

  try {
    if (actionType === 'create') {
      // Schedule creation process
      const scheduleName = formData.get('scheduleName') as string;
      const scheduleAction = formData.get('scheduleAction') as 'start' | 'stop';
      const cronExpression = formData.get('cronExpression') as string;
      const description = formData.get('description') as string;
      
      await schedulerClient.createSchedule({
        name: scheduleName,
        instanceId,
        action: scheduleAction,
        cronExpression,
        description
      }, request);
      
      return { success: true, message: 'Success to create a schedule' };
    } else if (actionType === 'delete') {
      // Schedule deletion process
      const scheduleName = formData.get('scheduleName') as string;
      await schedulerClient.deleteSchedule({name: scheduleName}, request);
      
      return { success: true, message: 'Success to delete a schedule' };
    } else {
      return { error: "It's not valid action type" };
    }
  } catch (error) {
    console.error(`Error ${actionType}ing schedule for instance ${instanceId}:`, error);
    return { 
      error: `Failed to ${actionType === 'create' ? 'create' : 'delete'} schedule`,
      details: error instanceof Error ? error.message : String(error)
    };
  }
}
