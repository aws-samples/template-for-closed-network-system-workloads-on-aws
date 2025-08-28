import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { requireAdmin } from '~/utils/auth.server';
import { User, getUsers, addUser, deleteUser } from '~/models/user.server';
import { Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '~/components';

export async function loader({ request }: LoaderFunctionArgs) {
  // 管理者権限チェック
  const user: User = await requireAdmin(request);
  
  // ユーザー一覧を取得
  const userList = await getUsers();
  
  return { currentUser: user, users: userList.users };
}

export async function action({ request }: ActionFunctionArgs) {
  // 管理者権限チェック
  await requireAdmin(request);
  
  const formData = await request.formData();
  const action = formData.get('_action');
  
  // ユーザー追加
  if (action === 'add') {
    const email = formData.get('email')?.toString();
    const isAdminStr = formData.get('isAdmin')?.toString();
    const groupId = formData.get('groupId')?.toString() || null;
    
    if (!email || !isAdminStr || (isAdminStr !== 'true' && isAdminStr !== 'false')) {
      return { error: '無効な入力です' };
    }
    
    const isAdmin = isAdminStr === 'true';
    
    // 管理者の場合はgroupIdをnullに設定可能、一般ユーザーの場合は必須
    if (!isAdmin && !groupId) {
      return { error: '一般ユーザーにはグループIDが必要です' };
    }
    
    try {
      await addUser({ 
        email, 
        isAdmin,
        groupId: isAdmin ? null : groupId
      });
      return redirect('/dashboard/users');
    } catch (error: any) {
      return { error: error.message };
    }
  }
  
  // ユーザー削除
  if (action === 'delete') {
    const email = formData.get('email')?.toString();
    const currentUserEmail = formData.get('currentUserEmail')?.toString();
    
    if (!email) {
      return { error: 'メールアドレスが必要です' };
    }
    
    // 自分自身は削除できない
    if (email === currentUserEmail) {
      return { error: '自分自身は削除できません' };
    }
    
    try {
      await deleteUser(email);
      return redirect('/dashboard/users');
    } catch (error: any) {
      return { error: error.message };
    }
  }
  
  return { error: '無効なアクション' };
}

export default function Users() {
  const { currentUser, users } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';
  
  return (
    <div className="users-container">
      <header className="dashboard-header">
        <h1>ユーザー管理</h1>
        <div className="nav-links">
          <a href="/dashboard" className="nav-link">ダッシュボードに戻る</a>
        </div>
      </header>
      
      {/* ユーザー追加フォーム */}
      <div className="add-user-form">
        <h2>ユーザーを追加</h2>
        <Form method="post">
          <input type="hidden" name="_action" value="add" />
          
          <Input
            id="email"
            name="email"
            type="email"
            label="メールアドレス"
            required
            disabled={isSubmitting}
            placeholder="example@example.com"
          />
          
          <Select
            id="isAdmin"
            name="isAdmin"
            label="権限"
            options={[
              { value: 'false', label: '一般ユーザー' },
              { value: 'true', label: '管理者' }
            ]}
            required
            disabled={isSubmitting}
          />
          
          <Input
            id="groupId"
            name="groupId"
            type="text"
            label="グループID（一般ユーザーのみ必須）"
            disabled={isSubmitting}
            placeholder="例: group-001"
          />
          
          <Button 
            type="submit" 
            disabled={isSubmitting}
            fullWidth
          >
            {isSubmitting ? '追加中...' : 'ユーザーを追加'}
          </Button>
        </Form>
        
        {actionData?.error && <div className="error">{actionData.error}</div>}
      </div>
      
      {/* ユーザー一覧 */}
      <div className="users-list">
        <h2>ユーザー一覧</h2>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>メールアドレス</TableHeaderCell>
              <TableHeaderCell>権限</TableHeaderCell>
              <TableHeaderCell>グループID</TableHeaderCell>
              <TableHeaderCell>作成日時</TableHeaderCell>
              <TableHeaderCell>操作</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(users as User[]).map(user => (
              <TableRow key={user.email}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.isAdmin ? '管理者' : '一般ユーザー'}</TableCell>
                <TableCell>{user.groupId || '（管理者は全グループ）'}</TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleString('ja-JP')}</TableCell>
                <TableCell>
                  <Form method="post">
                    <input type="hidden" name="_action" value="delete" />
                    <input type="hidden" name="email" value={user.email} />
                    <input type="hidden" name="currentUserEmail" value={currentUser.email} />
                    <Button
                      type="submit"
                      variant="danger"
                      size="sm"
                      disabled={isSubmitting || user.email === currentUser.email}
                    >
                      削除
                    </Button>
                  </Form>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>ユーザーが登録されていません</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
