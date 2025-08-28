import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Form, Link, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import { ec2Client } from '~/utils/aws.server';
import { requireUser } from '~/utils/auth.server';
import { Button, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '~/components';

type Instance = {
  id: string | undefined;
  state: string | undefined;
  type: string | undefined;
  name: string;
  groupId: string | null; // インスタンスのグループID
}

export async function action({ request }: ActionFunctionArgs) {
  // 認証チェック
  const user = await requireUser(request);

  // フォームデータを取得
  const formData = await request.formData();
  console.log(`DEBUG: ${JSON.stringify(formData)}`)
  const action = formData.get('action') as string;
  const instanceId = formData.get('instanceId') as string;
  const instanceGroupId = formData.get('groupId') as string;

  // 権限チェック
  // adminはすべてのインスタンスを操作可能、userは自分のgroupIdに一致するインスタンスのみ操作可能
  if (user.isAdmin != false && user.groupId !== instanceGroupId) {
    console.error(`User ${user.email} attempted to ${action} instance ${instanceId} without permission`);
    return redirect('/dashboard');
  }

  // インスタンスの起動または停止
  try {
    if (action === 'start') {
      await ec2Client.startInstance({ instanceId });
    } else if (action === 'stop') {
      await ec2Client.stopInstance({ instanceId });
    }
  } catch (error) {
    console.error(`Error ${action}ing instance ${instanceId}:`, error);
  }

  // 同じページにリダイレクト（リロードして最新の状態を表示）
  return redirect('/dashboard');
}

export async function loader({ request }: LoaderFunctionArgs) {
  // 認証チェック
  const user = await requireUser(request);

  let instances: Array<Instance> = [];
  
  try {
    // フィルターの設定
    const filters = [];
    
    // userロールの場合、GroupIdでフィルタリング
    if (user.isAdmin === false && user.groupId) {
      filters.push({
        Name: 'tag:GroupId',
        Values: [user.groupId],
      });
    }
    
    // EC2インスタンスの一覧を取得
    const { Reservations } = await ec2Client.describeInstances({
      Filters: filters,
    });

    // インスタンス情報を整形
    instances = Reservations?.flatMap(reservation =>
      reservation.Instances?.map(instance => ({
        id: instance.InstanceId || '',
        state: instance.State?.Name,
        type: instance.InstanceType,
        name: instance.Tags?.find(tag => tag.Key === 'Name')?.Value || 'No Name',
        groupId: instance.Tags?.find(tag => tag.Key === 'GroupId')?.Value || null,
      })) || []
    ) || [];
  } catch (error) {
    console.error('Error fetching EC2 instances:', error);
    // エラーが発生した場合は空の配列を使用
  }

  return { user, instances };
}

export default function Dashboard() {
  const { user, instances } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>EC2インスタンス管理ダッシュボード</h1>
        <div className="user-info">
          <span>{user?.email}</span>
          <div className="nav-links">
            {user.isAdmin && (
              <Link to="/dashboard/users" className="nav-link">
                ユーザー管理
              </Link>
            )}
            <form action="/logout" method="post" style={{ display: 'inline', margin: 0 }}>
              <Button type="submit" variant="outline" size="sm">
                ログアウト
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main>
        <h2>インスタンス一覧</h2>
        <div className="flex justify-end mb-4">
          <Button 
            type="button" 
            variant="text" 
            size="sm"
            onClick={() => window.location.reload()}
            disabled={isSubmitting}
          >
            更新
          </Button>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>名前</TableHeaderCell>
              <TableHeaderCell>インスタンスID</TableHeaderCell>
              <TableHeaderCell>タイプ</TableHeaderCell>
              {user.isAdmin && <TableHeaderCell>グループID</TableHeaderCell>}
              <TableHeaderCell>状態</TableHeaderCell>
              <TableHeaderCell>アクション</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(instances as Instance[]).map(instance => (
              <TableRow key={instance.id}>
                <TableCell>{instance.name}</TableCell>
                <TableCell>{instance.id}</TableCell>
                <TableCell>{instance.type}</TableCell>
                {user.isAdmin && <TableCell>{instance.groupId || '未設定'}</TableCell>}
                <TableCell>
                  <StatusBadge status={instance.state || 'unknown'} />
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    {instance.state === 'stopped' && (
                      <Form method="post">
                        <input type="hidden" name="instanceId" value={instance.id} />
                        <input type="hidden" name="action" value="start" />
                        <input type="hidden" name="groupId" value={instance.groupId || ''} />
                        <Button 
                          type="submit" 
                          variant="text" 
                          size="xs"
                          disabled={isSubmitting}
                        >
                          起動
                        </Button>
                      </Form>
                    )}
                    {instance.state === 'running' && (
                      <Form method="post">
                        <input type="hidden" name="instanceId" value={instance.id} />
                        <input type="hidden" name="action" value="stop" />
                        <input type="hidden" name="groupId" value={instance.groupId || ''} />
                        <Button 
                          type="submit" 
                          variant="text" 
                          size="xs"
                          disabled={isSubmitting}
                        >
                          停止
                        </Button>
                      </Form>
                    )}
                    {instance.state !== 'running' && instance.state !== 'stopped' && (
                      <span className="text-sm text-gray-500">処理中...</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {instances.length === 0 && (
              <TableRow>
                <TableCell colSpan={user.isAdmin ? 6 : 5}>インスタンスが見つかりません</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </main>
    </div>
  );
}
