import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { requireAdmin } from '../utils/auth.server';
import { User, getUsers, addUser, deleteUser } from '../models/user.server';
import { Button, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../components';

export async function loader({ request }: LoaderFunctionArgs) {
  // Check admin privileges
  const user: User = await requireAdmin(request);
  
  // Get user list
  const userList = await getUsers({},request);
  
  return { currentUser: user, users: userList.users };
}

export async function action({ request }: ActionFunctionArgs) {
  // Check admin privileges
  await requireAdmin(request);
  
  const formData = await request.formData();
  const action = formData.get('_action');
  
  // Add user
  if (action === 'add') {
    const email = formData.get('email')?.toString();
    const isAdminStr = formData.get('isAdmin')?.toString();
    const groupId = formData.get('groupId')?.toString() || null;
    
    if (!email || !isAdminStr || (isAdminStr !== 'true' && isAdminStr !== 'false')) {
      return { error: '無効な入力です' };
    }
    
    const isAdmin = isAdminStr === 'true';
    
    // For admins, groupId can be set to null; for regular users, it's required
    if (!isAdmin && !groupId) {
      return { error: '一般ユーザーにはグループIDが必要です' };
    }
    
    try {
      await addUser({ 
        email, 
        isAdmin,
        groupId: isAdmin ? null : groupId
      }, request);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }
  
  // Delete user
  if (action === 'delete') {
    const email = formData.get('email')?.toString();
    const currentUserEmail = formData.get('currentUserEmail')?.toString();
    
    if (!email) {
      return { error: 'メールアドレスが必要です' };
    }
    
    // Cannot delete yourself
    if (email === currentUserEmail) {
      return { error: '自分自身は削除できません' };
    }
    
    try {
      await deleteUser(email, request);
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
  
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState('false');
  const [groupId, setGroupId] = useState('');
  
  // フォームリセット関数
  const resetForm = () => {
    setEmail('');
    setIsAdmin('false');
    setGroupId('');
  };
  
  // Clear groupId when admin is selected
  useEffect(() => {
    if (isAdmin === 'true') {
      setGroupId('');
    }
  }, [isAdmin]);
  
  // ユーザー追加成功時にフォームをリセット
  useEffect(() => {
    // 送信完了 && エラーなし && actionDataが存在する場合にリセット
    if (!isSubmitting && !actionData?.error && actionData !== undefined) {
      resetForm();
    }
  }, [isSubmitting, actionData]);
  
  return (
    <div className="users-container">
      <header className="dashboard-header">
        <h1>ユーザー管理</h1>
        <div className="nav-links">
          <a href="/dashboard" className="nav-link">ダッシュボードに戻る</a>
        </div>
      </header>
      
      {/* User addition form */}
      <div className="add-user-form mb-6 p-6 bg-gray-50 rounded-lg border max-w-6xl">
        <h2 className="text-xl font-semibold mb-4">ユーザーを追加</h2>
        <Form method="post" className="w-full">
          <input type="hidden" name="_action" value="add" />
          
          <div className="flex flex-col lg:flex-row gap-3 items-end mb-4">
            <div className="flex-1 min-w-0 max-w-md">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-1 block">
                メールアドレス
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="example@example.com"
                className="w-full py-2 px-3"
              />
            </div>
            
            <div className="w-full lg:w-40 min-w-0">
              <Label className="text-sm font-medium text-gray-700 mb-1 block">
                権限
              </Label>
              <Select
                id="isAdmin"
                name="isAdmin"
                value={isAdmin}
                onChange={(e) => setIsAdmin(e.target.value)}
                options={[
                  { value: 'false', label: '一般ユーザー' },
                  { value: 'true', label: '管理者' }
                ]}
                required
                disabled={isSubmitting}
                className="w-full"
              />
            </div>
            
            <div className="w-full lg:w-36 min-w-0">
              <Label htmlFor="groupId" className="text-sm font-medium text-gray-700 mb-1 block">
                グループID
              </Label>
              <Input
                id="groupId"
                name="groupId"
                type="text"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={isSubmitting || isAdmin === 'true'}
                placeholder="group-001"
                className={`w-full py-2 px-3 ${isAdmin === 'true' ? 'bg-gray-100 text-gray-400' : ''}`}
              />
            </div>
            
            <div className="w-full lg:w-24 min-w-0">
              <Button 
                type="submit" 
                disabled={isSubmitting}
                size="lg"
                variant="solid-fill"
                className="w-full py-2 px-3 text-sm"
              >
                {isSubmitting ? '追加中...' : '追加'}
              </Button>
            </div>
          </div>
          
          <div className="text-xs text-gray-600">
            ※ グループIDは一般ユーザーのみ必須です
          </div>
        </Form>
        
        {actionData?.error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {actionData.error}
          </div>
        )}
        
        {actionData?.success && (
          <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            ユーザーが正常に追加されました
          </div>
        )}
      </div>
      
      {/* User list */}
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
