import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { schedulerClient } from '~/utils/aws.server';
import { requireUser } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // 認証チェック
  await requireUser(request);

  // クエリパラメータからインスタンスIDを取得
  const url = new URL(request.url);
  const instanceId = url.searchParams.get('instanceId');

  if (!instanceId) {
    return { error: 'インスタンスIDが指定されていません' };
  }
  console.log(`start load function of schedule`);

  try {
    const schedules = await schedulerClient.listSchedulesForInstance({instanceId}, request);
    return { schedules };
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return { error: 'スケジュールの取得に失敗しました' };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  // 認証チェック
  const user = await requireUser(request);

  // フォームデータを取得
  const formData = await request.formData();
  const actionType = formData.get('actionType') as string;
  const instanceId = formData.get('instanceId') as string;
  const instanceGroupId = formData.get('groupId') as string;

  // 権限チェック
  // adminはすべてのインスタンスを操作可能、userは自分のgroupIdに一致するインスタンスのみ操作可能
  if (user.isAdmin != false && user.groupId !== instanceGroupId) {
    console.error(`User ${user.email} attempted to ${actionType} schedule for instance ${instanceId} without permission`);
    return { error: '権限がありません' };
  }

  try {
    if (actionType === 'create') {
      // スケジュール作成処理
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
      
      return { success: true, message: 'スケジュールが作成されました' };
    } else if (actionType === 'delete') {
      // スケジュール削除処理
      const scheduleName = formData.get('scheduleName') as string;
      await schedulerClient.deleteSchedule({name: scheduleName}, request);
      
      return { success: true, message: 'スケジュールが削除されました' };
    } else {
      return { error: '不明なアクションタイプです' };
    }
  } catch (error) {
    console.error(`Error ${actionType}ing schedule for instance ${instanceId}:`, error);
    return { 
      error: `スケジュールの${actionType === 'create' ? '作成' : '削除'}に失敗しました`,
      details: error instanceof Error ? error.message : String(error)
    };
  }
}
