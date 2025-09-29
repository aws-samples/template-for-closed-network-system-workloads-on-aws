import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Form, Link, useLoaderData, useNavigation, useSubmit, useFetcher } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { useDebounce } from '~/hooks/useDebounce';
import { ec2Client, ecsClient, rdsClient } from '~/utils/aws.server';
import { requireUser } from '~/utils/auth.server';
import type { AppError } from '~/utils/error.server';
import type { Schedule } from '~/models/schedule';
import type { Service } from '~/models/service';
import type { Database } from '~/models/database';
import { 
  Button, 
  StatusBadge, 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeaderCell, 
  TableRow,
  ScheduleForm,
  ErrorAlert,
  ServiceList,
  DatabaseList,
  RefreshButton
} from '~/components';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';

type Instance = {
  id: string | undefined;
  state: string | undefined;
  type: string | undefined;
  alternativeType: string | undefined; // 代替タイプ
  name: string;
  groupId: string | null; // インスタンスのグループID
}

export async function action({ request }: ActionFunctionArgs) {
  // フォームデータを取得
  const formData = await request.formData();
  const action = formData.get('action') as string;
  const instanceId = formData.get('instanceId') as string;
  const instanceGroupId = formData.get('groupId') as string;
  const dbClusterIdentifier = formData.get('dbClusterIdentifier') as string;
  console.log(`Action: ${action}, InstanceId: ${instanceId}, GroupId: ${instanceGroupId}, DBClusterIdentifier: ${dbClusterIdentifier}`);

  // インスタンスまたはDBクラスターの操作
  try {
    if (action === 'start') {
      console.info('startInstance called');
      await ec2Client.startInstance({ instanceId }, request);
    } else if (action === 'stop') {
      await ec2Client.stopInstance({ instanceId }, request);
    } else if (action === 'stopDBCluster') {
      await rdsClient.stopDBCluster({ dbClusterIdentifier }, request);
    } else if (action === 'startDBCluster') {
      await rdsClient.startDBCluster({ dbClusterIdentifier }, request);
    } else if (action === 'updateAlternativeType') {
      const alternativeType = formData.get('alternativeType') as string;
      
      // AlternativeTypeタグを更新
      await ec2Client.createTags({
        resourceIds: [instanceId],
        tags: [
          {
            Key: 'AlternativeType',
            Value: alternativeType
          }
        ]
      }, request);
    } else if (action === 'createSchedule' || action === 'deleteSchedule') {
      // スケジュール作成・削除処理はAPIエンドポイントに委譲
      const apiFormData = new FormData();
      apiFormData.append('actionType', action === 'createSchedule' ? 'create' : 'delete');
      apiFormData.append('instanceId', instanceId);
      apiFormData.append('groupId', instanceGroupId);
      
      if (action === 'createSchedule') {
        apiFormData.append('scheduleName', formData.get('scheduleName') as string);
        apiFormData.append('scheduleAction', formData.get('scheduleAction') as string);
        apiFormData.append('cronExpression', formData.get('cronExpression') as string);
        apiFormData.append('description', formData.get('description') as string);
      } else {
        apiFormData.append('scheduleName', formData.get('scheduleName') as string);
      }
      
      const response = await fetch('/api/schedules', {
        method: 'POST',
        body: apiFormData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'スケジュール操作に失敗しました');
      }
    }
  } catch (error) {
    console.error(`Error ${action}ing instance ${instanceId}:`, error);
    
    // エラー時はJSONレスポンスを返す
    const appError = error as AppError;
    return {
      success: false,
      error: {
        message: appError.message || 'エラーが発生しました',
        details: appError.details,
        code: appError.code
      }
    };
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
    
    // EC2インスタンスの一覧を取得（リクエストオブジェクトを渡して認証チェック）
    const { Reservations } = await ec2Client.describeInstances({
      Filters: filters,
    }, request);

    // インスタンス情報を整形
    instances = Reservations?.flatMap(reservation =>
      reservation.Instances?.map(instance => ({
        id: instance.InstanceId || '',
        state: instance.State?.Name,
        type: instance.InstanceType,
        alternativeType: instance.Tags?.find(tag => tag.Key === 'AlternativeType')?.Value || '未登録',
        name: instance.Tags?.find(tag => tag.Key === 'Name')?.Value || 'No Name',
        groupId: instance.Tags?.find(tag => tag.Key === 'GroupId')?.Value || null,
      })) || []
    ) || [];
  } catch (error) {
    console.error('Error fetching EC2 instances:', error);
    // エラーが発生した場合は空の配列を使用
  }

  // ECSサービスの一覧を取得
  let services: Array<Service> = [];
  try {
    // クラスター一覧を取得（リクエストオブジェクトを渡して認証チェック）
    const { clusterArns } = await ecsClient.listClusters(request);
    
    // 各クラスターのサービスを取得
    for (const clusterArn of clusterArns || []) {
      const clusterName = clusterArn.split('/').pop() || '';
      
      // サービス一覧を取得（リクエストオブジェクトを渡して認証チェック）
      const { serviceArns } = await ecsClient.listServices({ cluster: clusterArn }, request);
      
      if (serviceArns && serviceArns.length > 0) {
        // サービスの詳細情報を取得（リクエストオブジェクトを渡して認証チェック）
        const { services: serviceDetails } = await ecsClient.describeServices({
          cluster: clusterArn,
          services: serviceArns
        }, request);
        
        // サービス情報を整形
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

  // RDS DBクラスターの一覧を取得
  let databases: Array<Database> = [];
  try {
    const { DBClusters } = await rdsClient.describeDBClusters(request);
    
    // DBクラスター情報を整形
    databases = DBClusters?.map(cluster => {
      // ステータスの判定
      let status = cluster.Status || '';
      
      // ロールの判定（クラスターの場合は常にクラスター）
      let role = 'クラスター';
      
      return {
        identifier: cluster.DBClusterIdentifier || '',
        status,
        role,
        engine: cluster.Engine || '',
        endpoint: cluster.Endpoint,
        arn: cluster.DBClusterArn || ''
      };
    }) || [];
  } catch (error) {
    console.error('Error fetching RDS DB clusters:', error);
  }

  return { user, instances, services, databases };
}

export default function Dashboard() {
  const { user, instances, services, databases } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const submit = useSubmit();
  
  // 更新ハンドラ
  const handleRefresh = () => {
    window.location.reload();
  };
  
  // 選択されたインスタンスの管理
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  
  // インスタンスを選択する関数
  const selectInstance = (instanceId: string) => {
    // 同じインスタンスが選択された場合は選択解除（トグル動作）
    if (selectedInstanceId === instanceId) {
      setSelectedInstanceId(null);
      return;
    }
    
    setSelectedInstanceId(instanceId);
    
    // 選択されたインスタンスのスケジュール情報を取得
    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: true
    }));
    scheduleFetcher.load(`/api/schedules?instanceId=${instanceId}`);
    
    // インスタンスの入力状態を初期化（まだ存在しない場合）
    if (!newScheduleInputs[instanceId]) {
      setNewScheduleInputs(prev => ({
        ...prev,
        [instanceId]: { action: 'start', cron: '', description: '' }
      }));
    }
    
    // 選択されたインスタンスを設定
    setSelectedInstanceForSchedule(instances.find(i => i.id === instanceId) || null);
  };
  
  // 代替タイプ編集関連の状態
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null); // 編集中のインスタンスID
  const [availableInstanceTypes, setAvailableInstanceTypes] = useState<Record<string, string[]>>({});
  const [selectedAlternativeType, setSelectedAlternativeType] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [typeQuery, setTypeQuery] = useState('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  
  // スケジュール関連の状態
  const [selectedInstanceForSchedule, setSelectedInstanceForSchedule] = useState<Instance | null>(null);
  // インスタンスIDごとにスケジュールを保持するオブジェクト
  const [schedules, setSchedules] = useState<Record<string, Schedule[]>>({});
  // インスタンスIDごとの新規スケジュール入力状態を管理
  const [newScheduleInputs, setNewScheduleInputs] = useState<Record<string, {
    action: 'start' | 'stop',
    cron: string,
    description: string
  }>>({});
  const [isScheduleLoading, setIsScheduleLoading] = useState<Record<string, boolean>>({});
  
  // デバウンスフックを使用（300msのデバウンス時間）
  const debouncedInputValue = useDebounce(inputValue, 300);
  
  // デバウンスされた値が変更されたときにのみtypeQueryを更新
  useEffect(() => {
    setTypeQuery(debouncedInputValue);
  }, [debouncedInputValue]);
  
  // エラーアラート関連の状態
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [isErrorAlertVisible, setIsErrorAlertVisible] = useState(false);

  // useFetcherでフォーム送信とエラーハンドリング
  const actionFetcher = useFetcher<{
    success?: boolean;
    error?: AppError;
  }>();

  // actionFetcherの結果を監視
  useEffect(() => {
    if (actionFetcher.data && !actionFetcher.data.success && actionFetcher.data.error) {
      const error = actionFetcher.data.error;
      setErrorMessage(error.message);
      setErrorDetails(error.details || null);
      setIsErrorAlertVisible(true);
    }
  }, [actionFetcher.data]);

  // 代替タイプの編集ボタンをクリックしたときの処理
  const handleAlternativeTypeClick = async (instance: Instance) => {
    const instanceId = instance.id || '';
    
    // 既に編集中のインスタンスの場合は編集モードを終了
    if (editingInstanceId === instanceId) {
      setEditingInstanceId(null);
      return;
    }
    
    // 編集モードを開始
    setEditingInstanceId(instanceId);
    
    // ローディング状態を設定
    setIsLoading(prev => ({ ...prev, [instanceId]: true }));
    
    try {
      // インスタンスタイプのファミリーを取得（例：t2.microからt2を抽出）
      const instanceFamily = instance.type?.split('.')[0] || '';
      
      // 入力値を設定（これがデバウンスされてtypeQueryに反映される）
      setInputValue(instanceFamily);
      
      // 検索クエリに基づいてインスタンスタイプを取得
      const response = await fetch(`/api/instance-types?query=${instanceFamily}`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableInstanceTypes(prev => ({ 
          ...prev, 
          [instanceId]: data.instanceTypes 
        }));
        
        // 現在の代替タイプがあれば選択、なければ空に
        setSelectedAlternativeType(prev => ({ 
          ...prev, 
          [instanceId]: instance.alternativeType && instance.alternativeType !== '未登録' ? instance.alternativeType : '' 
        }));
      } else {
        console.error('インスタンスタイプの取得に失敗しました');
        // 取得失敗時には空の配列を設定する
        setAvailableInstanceTypes(prev => ({ ...prev, [instanceId]: [] }));
      }
    } catch (error) {
      console.error('インスタンスタイプの取得中にエラーが発生しました:', error);
    } finally {
      setIsLoading(prev => ({ ...prev, [instanceId]: false }));
    }
  };

  // 代替タイプを保存する処理
  const handleSaveAlternativeType = (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    const alternativeType = selectedAlternativeType[instanceId];
    
    if (instance && alternativeType) {
      const formData = new FormData();
      formData.append('action', 'updateAlternativeType');
      formData.append('instanceId', instanceId);
      formData.append('groupId', instance.groupId || '');
      formData.append('alternativeType', alternativeType);
      
      actionFetcher.submit(formData, { method: 'post' });
      setEditingInstanceId(null); // 編集モードを終了
    }
  };
  
  // スケジュール関連のfetcher
  const scheduleFetcher = useFetcher<{ 
    schedules?: Array<Schedule>,
    error?: string 
  }>();
  
  // scheduleFetcherの結果を処理
  useEffect(() => {
    // 現在選択されているインスタンスのIDを使用
    if (selectedInstanceForSchedule?.id) {
      const instanceId = selectedInstanceForSchedule.id;
      
      // ローディング状態の更新
      if (scheduleFetcher.state === 'loading') {
        setIsScheduleLoading(prev => ({
          ...prev,
          [instanceId]: true
        }));
      } else if (scheduleFetcher.state === 'idle' && scheduleFetcher.data) {
        // スケジュールデータを更新
        if (scheduleFetcher.data.schedules) {
          setSchedules(prev => ({
            ...prev,
            [instanceId]: scheduleFetcher.data?.schedules || []
          }));
        }
        
        // ローディング状態を更新
        setIsScheduleLoading(prev => ({
          ...prev,
          [instanceId]: false
        }));
      }
    }
  }, [scheduleFetcher.data, scheduleFetcher.state, selectedInstanceForSchedule]);

  // スケジュール追加処理
  const handleAddSchedule = () => {
    if (!selectedInstanceForSchedule) return;
    
    const instanceId = selectedInstanceForSchedule.id || '';
    const inputs = newScheduleInputs[instanceId] || { action: 'start', cron: '', description: '' };
    
    if (!inputs.cron) return;
    
    // ローディング状態を更新
    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: true
    }));
    
    const formData = new FormData();
    formData.append('actionType', 'create');
    formData.append('instanceId', instanceId);
    formData.append('groupId', selectedInstanceForSchedule.groupId || '');
    formData.append('scheduleName', `${instanceId}-${inputs.action}-${Date.now()}`);
    formData.append('scheduleAction', inputs.action);
    formData.append('cronExpression', inputs.cron);
    formData.append('description', inputs.description);
    
    console.log('Creating schedule with cron expression:', inputs.cron);
    
    // useFetcherを使用してスケジュールを作成
    scheduleFetcher.submit(formData, {
      method: 'post',
      action: '/api/schedules'
    });
    
    // フォームをリセット
    setNewScheduleInputs(prev => ({
      ...prev,
      [instanceId]: { action: 'start', cron: '', description: '' }
    }));

    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: false
    }));
  };

  // スケジュール削除処理
  const handleDeleteSchedule = (instanceId: string, scheduleName: string) => {
    // ローディング状態を更新
    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: true
    }));
    
    const formData = new FormData();
    formData.append('actionType', 'delete');
    formData.append('instanceId', instanceId);
    formData.append('groupId', instances.find(i => i.id === instanceId)?.groupId || '');
    formData.append('scheduleName', scheduleName);
    
    // useFetcherを使用してスケジュールを削除
    scheduleFetcher.submit(formData, {
      method: 'post',
      action: '/api/schedules'
    });
    
    // スケジュールのリストから削除（楽観的UI更新）
    setSchedules(prev => {
      const updatedSchedules = prev[instanceId]?.filter(schedule => schedule.name !== scheduleName) || [];
      return {
        ...prev,
        [instanceId]: updatedSchedules
      };
    });

    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: false
    }));
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>ダッシュボード</h1>
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
          <RefreshButton 
            onRefresh={handleRefresh}
            isSubmitting={isSubmitting}
          />
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>名前</TableHeaderCell>
              <TableHeaderCell>インスタンスID</TableHeaderCell>
              <TableHeaderCell>タイプ</TableHeaderCell>
              <TableHeaderCell>代替タイプ</TableHeaderCell>
              {user.isAdmin && <TableHeaderCell>グループID</TableHeaderCell>}
              <TableHeaderCell>状態</TableHeaderCell>
              <TableHeaderCell>アクション</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(instances as Instance[]).map(instance => {
              const instanceId = instance.id || '';
              // インスタンスごとのスケジュール関連の状態を管理
              
              return (
                <>
                  <TableRow key={`row-${instance.id}`} className={selectedInstanceId === instance.id ? 'bg-gray-50' : ''}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div 
                          onClick={() => selectInstance(instanceId)}
                          className={`w-4 h-4 rounded-full border border-gray-400 flex items-center justify-center cursor-pointer ${selectedInstanceId === instanceId ? 'border-blue-600' : 'hover:border-gray-600'}`}
                          role="radio"
                          aria-checked={selectedInstanceId === instanceId}
                          aria-label={selectedInstanceId === instanceId ? "選択解除" : "選択"}
                          tabIndex={0}
                        >
                          {selectedInstanceId === instanceId && (
                            <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                          )}
                        </div>
                        <span>{instance.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{instance.id}</TableCell>
                    <TableCell>{instance.type}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {editingInstanceId === instance.id ? (
                          // 編集モード時はプルダウンを表示
                          <div className="w-full">
                            {isLoading[instance.id || ''] ? (
                              <div className="flex justify-center py-1">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <Combobox 
                                  value={selectedAlternativeType[instance.id || '']} 
                                  onChange={(value: string | null) => {
                                    setSelectedAlternativeType(prev => ({ 
                                      ...prev, 
                                      [instance.id || '']: value || '' 
                                    }));
                                  }}
                                >
                                  <div className="relative">
                                    <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left border border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-300" style={{ minWidth: '180px' }}>
                                      <ComboboxInput
                                        className="w-full border-none py-1 pl-2 pr-8 text-sm leading-5 text-gray-900 focus:ring-0"
                                        displayValue={(type:string) => type}
                                        onChange={(event) => setInputValue(event.target.value)}
                                        placeholder="タイプを検索..."
                                      />
                                      <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                        </svg>
                                      </ComboboxButton>
                                    </div>
                                    <ComboboxOptions className="absolute mt-1 max-h-80 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-100" style={{ minWidth: '220px' }}>
                                      {(availableInstanceTypes[instance.id || ''] || []).filter(type => 
                                        typeQuery === '' || type.toLowerCase().includes(typeQuery.toLowerCase())
                                      ).length === 0 ? (
                                        <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                                          該当するタイプがありません
                                        </div>
                                      ) : (
                                        (availableInstanceTypes[instance.id || ''] || [])
                                          .filter(type => typeQuery === '' || type.toLowerCase().includes(typeQuery.toLowerCase()))
                                          .map((type) => (
                                          <ComboboxOption
                                            key={type}
                                            className='relative cursor-default select-none py-2 pl-8 pr-4 text-gray-900'
                                            value={type}
                                          >
                                            {({ selected }) => (
                                              <>
                                                <span
                                                  className={`block truncate ${
                                                    selected ? 'font-medium' : 'font-normal'
                                                  }`}
                                                >
                                                  {type}
                                                </span>
                                                {selected ? (
                                                  <span
                                                    className='absolute inset-y-0 left-0 flex items-center pl-3 text-gray-900'
                                                  >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                    </svg>
                                                  </span>
                                                ) : null}
                                              </>
                                            )}
                                          </ComboboxOption>
                                        ))
                                      )}
                                    </ComboboxOptions>
                                  </div>
                                </Combobox>
                                <div className="flex space-x-1">
                                  <button
                                    onClick={() => handleSaveAlternativeType(instance.id || '')}
                                    className="text-gray-500 hover:text-green-600 focus:outline-none"
                                    title="保存"
                                    disabled={!selectedAlternativeType[instance.id || '']}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setEditingInstanceId(null)}
                                    className="text-gray-500 hover:text-red-600 focus:outline-none"
                                    title="キャンセル"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          // 通常表示モード
                          <>
                            <span>{instance.alternativeType === '未登録' ? (
                              <span className="text-gray-500">{instance.alternativeType}</span>
                            ) : instance.alternativeType}</span>
                            <button
                              onClick={() => handleAlternativeTypeClick(instance)}
                              className="text-gray-500 hover:text-blue-600 focus:outline-none"
                              disabled={isSubmitting}
                              title="代替タイプを編集"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                    {user.isAdmin && <TableCell>{instance.groupId || '未設定'}</TableCell>}
                    <TableCell>
                      <StatusBadge status={instance.state || 'unknown'} />
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        {instance.state === 'stopped' && (
                          <Button 
                            variant="text" 
                            size="xs"
                            disabled={isSubmitting || actionFetcher.state === 'submitting'}
                            onClick={() => {
                              const formData = new FormData();
                              formData.append('instanceId', instance.id || '');
                              formData.append('action', 'start');
                              formData.append('groupId', instance.groupId || '');
                              actionFetcher.submit(formData, { method: 'post' });
                            }}
                          >
                            起動
                          </Button>
                        )}
                        {instance.state === 'running' && (
                          <Button 
                            variant="text" 
                            size="xs"
                            disabled={isSubmitting || actionFetcher.state === 'submitting'}
                            onClick={() => {
                              const formData = new FormData();
                              formData.append('instanceId', instance.id || '');
                              formData.append('action', 'stop');
                              formData.append('groupId', instance.groupId || '');
                              actionFetcher.submit(formData, { method: 'post' });
                            }}
                          >
                            停止
                          </Button>
                        )}
                        {instance.state !== 'running' && instance.state !== 'stopped' && (
                          <span className="text-sm text-gray-500">処理中...</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                </>
              );
            })}
            {instances.length === 0 && (
              <TableRow>
                <TableCell colSpan={user.isAdmin ? 7 : 6}>インスタンスが見つかりません</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </main>

      {/* 選択されたインスタンスのスケジュール表示領域 */}
      {selectedInstanceId && (
        <div className="mt-8 p-4 border rounded-md bg-gray-50">
          <h3 className="text-lg font-medium mb-4">
            {instances.find(i => i.id === selectedInstanceId)?.name} のスケジュール
          </h3>
          <ScheduleForm
            schedules={schedules[selectedInstanceId] || []}
            newScheduleAction={newScheduleInputs[selectedInstanceId]?.action || 'start'}
            setNewScheduleAction={(action) => {
              setNewScheduleInputs(prev => ({
                ...prev,
                [selectedInstanceId]: { ...(prev[selectedInstanceId] || { cron: '', description: '' }), action }
              }));
            }}
            newScheduleCron={newScheduleInputs[selectedInstanceId]?.cron || ''}
            setNewScheduleCron={(cron) => {
              setNewScheduleInputs(prev => ({
                ...prev,
                [selectedInstanceId]: { ...(prev[selectedInstanceId] || { action: 'start', description: '' }), cron }
              }));
            }}
            newScheduleDescription={newScheduleInputs[selectedInstanceId]?.description || ''}
            setNewScheduleDescription={(description) => {
              setNewScheduleInputs(prev => ({
                ...prev,
                [selectedInstanceId]: { ...(prev[selectedInstanceId] || { action: 'start', cron: '' }), description }
              }));
            }}
            isLoading={isScheduleLoading[selectedInstanceId] || false}
            isSubmitting={isSubmitting}
            onAddSchedule={() => {
              handleAddSchedule();
            }}
            onDeleteSchedule={(scheduleName) => {
              handleDeleteSchedule(selectedInstanceId, scheduleName);
            }}
          />
        </div>
      )}


      {/* ECSサービス一覧 */}
      <ServiceList 
        services={services} 
        isSubmitting={isSubmitting}
        onRefresh={handleRefresh}
      />

      {/* RDS DBインスタンス一覧 */}
      <DatabaseList 
        databases={databases} 
        isSubmitting={isSubmitting}
        onRefresh={handleRefresh}
        actionFetcher={actionFetcher}
      />

      {/* エラーアラート */}
      <ErrorAlert
        isVisible={isErrorAlertVisible}
        message={errorMessage}
        details={errorDetails}
        onClose={() => setIsErrorAlertVisible(false)}
      />
    </div>
  );
}
