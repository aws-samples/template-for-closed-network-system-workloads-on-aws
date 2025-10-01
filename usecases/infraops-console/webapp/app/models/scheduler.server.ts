import { schedulerClient } from '~/utils/aws.server';

/**
 * Schedule type definition
 * Represents EC2 instance start/stop schedule
 */
export type Schedule = {
  name: string;
  action: 'start' | 'stop';
  description: string;
  cronExpression: string;
}

/**
 * Get schedules for a specific instance
 * @param instanceId EC2 instance ID
 * @param request Request object for authentication
 * @returns Array of Schedule objects
 */
export async function getSchedulesForInstance(instanceId: string, request: Request): Promise<Schedule[]> {
  try {
    const rawSchedules = await schedulerClient.listSchedulesForInstance({ instanceId }, request);
    
    // Map the raw schedule data to our Schedule type
    const schedules: Schedule[] = rawSchedules.map(schedule => ({
      name: schedule.name,
      action: schedule.action as 'start' | 'stop',
      description: schedule.description,
      cronExpression: schedule.cronExpression
    }));
    
    return schedules;
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return [];
  }
}

/**
 * Create a new schedule
 * @param params Schedule creation parameters
 * @param request Request object for authentication
 */
export async function createSchedule(params: {
  scheduleName: string;
  instanceId: string;
  action: 'start' | 'stop';
  cronExpression: string;
  description: string;
}, request: Request): Promise<void> {
  try {
    await schedulerClient.createSchedule({
      name: params.scheduleName,
      instanceId: params.instanceId,
      action: params.action,
      cronExpression: params.cronExpression,
      description: params.description
    }, request);
  } catch (error) {
    console.error(`Error creating schedule for instance ${params.instanceId}:`, error);
    throw new Error('Failed to create schedule');
  }
}

/**
 * Delete a schedule
 * @param scheduleName Schedule name to delete
 * @param request Request object for authentication
 */
export async function deleteSchedule(scheduleName: string, request: Request): Promise<void> {
  try {
    await schedulerClient.deleteSchedule({ name: scheduleName }, request);
  } catch (error) {
    console.error(`Error deleting schedule ${scheduleName}:`, error);
    throw new Error('Failed to delete schedule');
  }
}

/**
 * Update a schedule
 * @param params Schedule update parameters
 * @param request Request object for authentication
 */
export async function updateSchedule(params: {
  scheduleName: string;
  instanceId: string;
  action: 'start' | 'stop';
  cronExpression: string;
  description: string;
}, request: Request): Promise<void> {
  try {
    await schedulerClient.updateSchedule({
      name: params.scheduleName,
      instanceId: params.instanceId,
      action: params.action,
      cronExpression: params.cronExpression,
      description: params.description
    }, request);
  } catch (error) {
    console.error(`Error updating schedule ${params.scheduleName}:`, error);
    throw new Error('Failed to update schedule');
  }
}

/**
 * Get schedules for a specific instance with error handling
 * @param instanceId EC2 instance ID (can be null)
 * @param request Request object for authentication
 * @returns Response object with schedules or error
 */
export async function getSchedulesByInstanceId(
  instanceId: string | null,
  request: Request
): Promise<{ schedules?: Schedule[]; error?: string }> {
  if (!instanceId) {
    return { error: 'Instance ID is required' };
  }

  try {
    const schedules = await getSchedulesForInstance(instanceId, request);
    return { schedules };
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return { error: 'Failed to fetch schedules' };
  }
}

/**
 * Handle schedule actions (create/delete) with unified error handling
 * @param actionType Type of action to perform
 * @param params Parameters from form data
 * @param request Request object for authentication
 * @returns Response object with success/error status
 */
export async function handleScheduleAction(
  actionType: string,
  params: Record<string, any>,
  request: Request
): Promise<{ success?: boolean; error?: string; message?: string; details?: string }> {
  const instanceId = params.instanceId as string;

  try {
    if (actionType === 'create') {
      const scheduleName = params.scheduleName as string;
      const scheduleAction = params.scheduleAction as 'start' | 'stop';
      const cronExpression = params.cronExpression as string;
      const description = params.description as string;
      
      await createSchedule({
        scheduleName,
        instanceId,
        action: scheduleAction,
        cronExpression,
        description
      }, request);
      
      return { success: true, message: 'Schedule created successfully' };
    } else if (actionType === 'delete') {
      const scheduleName = params.scheduleName as string;
      await deleteSchedule(scheduleName, request);
      
      return { success: true, message: 'Schedule deleted successfully' };
    } else {
      return { error: 'Invalid action type' };
    }
  } catch (error) {
    console.error(`Error ${actionType}ing schedule for instance ${instanceId}:`, error);
    return { 
      error: `Failed to ${actionType === 'create' ? 'create' : 'delete'} schedule`,
      details: error instanceof Error ? error.message : String(error)
    };
  }
}
