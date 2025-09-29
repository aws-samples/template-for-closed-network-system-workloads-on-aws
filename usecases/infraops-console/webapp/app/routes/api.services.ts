import { ActionFunctionArgs, json } from '@remix-run/node';
import { ecsClient } from '~/utils/aws.server';
import { requireUser } from '~/utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  // 認証チェック
  await requireUser(request);

  // フォームデータを取得
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
      return { error: 'タスク数の更新に失敗しました' };
    }
  }
  
  return { error: '不正なアクション' };
}
