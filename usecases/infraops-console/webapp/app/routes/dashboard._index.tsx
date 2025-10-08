import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData, useNavigation, useSubmit, useFetcher } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { requireAuthentication } from '../utils/auth.server';
import type { AppError } from '../utils/error.server';
import { getEC2Instances, startEC2Instance, stopEC2Instance, updateEC2InstanceAlternativeType, type EC2Instance } from '../models/ec2.server';
import { getServices, type Service } from '../models/ecs.server';
import { getDatabases, startDatabase, stopDatabase, type Database } from '../models/rds.server';
import type { Schedule } from '../models/scheduler.server';
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
} from '../components';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';

type Instance = {
  id: string | undefined;
  state: string | undefined;
  type: string | undefined;
  alternativeType: string | undefined; // Alternative type
  name: string;
  groupId: string | null; // Instance group ID
}

export async function action({ request }: ActionFunctionArgs) {
  // Get form data
  const formData = await request.formData();
  const action = formData.get('action') as string;
  const instanceId = formData.get('instanceId') as string;
  const instanceGroupId = formData.get('groupId') as string;
  const dbClusterIdentifier = formData.get('dbClusterIdentifier') as string;
  const dbInstanceIdentifier = formData.get('dbInstanceIdentifier') as string;

  try {
    // Call API based on action type
    if (action === 'start') {
      console.info('startInstance called');
      await startEC2Instance(instanceId, request);
    } else if (action === 'stop') {
      await stopEC2Instance(instanceId, request);
    } else if (action === 'stopDBCluster') {
      await stopDatabase(dbClusterIdentifier, request);
    } else if (action === 'startDBCluster') {
      await startDatabase(dbClusterIdentifier, request);
    } else if (action === 'stopDBInstance') {
      // TODO: Implement DB instance stop functionality
      console.info('stopDBInstance called for:', dbInstanceIdentifier);
      // await stopDBInstance(dbInstanceIdentifier, request);
    } else if (action === 'startDBInstance') {
      // TODO: Implement DB instance start functionality
      console.info('startDBInstance called for:', dbInstanceIdentifier);
      // await startDBInstance(dbInstanceIdentifier, request);
    } else if (action === 'updateAlternativeType') {
      const alternativeType = formData.get('alternativeType') as string;
      
      await updateEC2InstanceAlternativeType(instanceId, alternativeType, request);
    } else if (action === 'createSchedule' || action === 'deleteSchedule') {
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
        throw new Error(errorData.error || 'Failed to process schedule');
      }
    }
  } catch (error) {
    console.error(`Error ${action}ing instance ${instanceId}:`, error);
    
    // Return JSON response on error
    const appError = error as AppError;
    return {
      success: false,
      error: {
        message: appError.message || 'Error occurred',
        details: appError.details,
        code: appError.code
      }
    };
  }

  // Load latest data
  return redirect('/dashboard');
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Check authentication
  const { user } = await requireAuthentication(request); 

  // Get list of EC2 instances using domain logic
  const ec2Instances = await getEC2Instances(request);
  
  // Convert EC2Instance to Instance type for compatibility with existing UI
  const instances: Array<Instance> = ec2Instances.map(ec2Instance => ({
    id: ec2Instance.instanceId,
    state: ec2Instance.state,
    type: ec2Instance.instanceType,
    alternativeType: ec2Instance.alternativeType,
    name: ec2Instance.name,
    groupId: ec2Instance.groupId,
  }));

  // Get list of ECS services
  const services = await getServices(request);

  // Get list of RDS DB clusters
  const databases = await getDatabases(request);

  return { user, instances, services, databases };
}

export default function Dashboard() {
  const { user, instances, services, databases } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  
  const handleRefresh = () => {
    window.location.reload();
  };
  
  // Store the ID of the selected instance
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  
  // function of selecting an instance
  const selectInstance = (instanceId: string) => {
    // Reset selected instance if the same instance is clicked
    if (selectedInstanceId === instanceId) {
      setSelectedInstanceId(null);
      return;
    }
    
    setSelectedInstanceId(instanceId);
    
    // Get schedules for the selected instance
    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: true
    }));
    scheduleFetcher.load(`/api/schedules?instanceId=${instanceId}`);
    
    // Initialize the input state of the instance (if it does not exist yet)
    if (!newScheduleInputs[instanceId]) {
      setNewScheduleInputs(prev => ({
        ...prev,
        [instanceId]: { action: 'start', cron: '', description: '' }
      }));
    }
    
    // Configure the selected instance for schedule management
    setSelectedInstanceForSchedule(instances.find(i => i.id === instanceId) || null);
  };
  
  // State for managing instance type changes
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null); // Instance ID being edited
  const [availableInstanceTypes, setAvailableInstanceTypes] = useState<Record<string, string[]>>({});
  const [selectedAlternativeType, setSelectedAlternativeType] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [typeQuery, setTypeQuery] = useState('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  
  // State for managing schedules
  const [selectedInstanceForSchedule, setSelectedInstanceForSchedule] = useState<Instance | null>(null);
  // State for storing schedules per instance ID
  const [schedules, setSchedules] = useState<Record<string, Schedule[]>>({});
  // State for storing new schedule inputs per instance ID
  const [newScheduleInputs, setNewScheduleInputs] = useState<Record<string, {
    action: 'start' | 'stop',
    cron: string,
    description: string
  }>>({});
  const [isScheduleLoading, setIsScheduleLoading] = useState<Record<string, boolean>>({});
  
  // Debounce hook (300ms debounce time)
  const debouncedInputValue = useDebounce(inputValue, 300);
  
  // Update typeQuery only when the debounced value changes
  useEffect(() => {
    setTypeQuery(debouncedInputValue);
  }, [debouncedInputValue]);
  
  // Error alert related state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isErrorAlertVisible, setIsErrorAlertVisible] = useState(false);

  // Submit form data and Error handling with useFetcher
  const actionFetcher = useFetcher<{
    success?: boolean;
    error?: AppError;
  }>();

  // Observe the result of actionFetcher
  useEffect(() => {
    if (actionFetcher.data && !actionFetcher.data.success && actionFetcher.data.error) {
      const error = actionFetcher.data.error;
      setErrorMessage(error.message);
      setIsErrorAlertVisible(true);
    }
  }, [actionFetcher.data]);

  // Process when the edit button for the alternative type is clicked
  const handleAlternativeTypeClick = async (instance: Instance) => {
    const instanceId = instance.id || '';
    
    // End edit mode if the instance is already being edited
    if (editingInstanceId === instanceId) {
      setEditingInstanceId(null);
      return;
    }
    
    // Start edit mode
    setEditingInstanceId(instanceId);
    
    // Set loading state
    setIsLoading(prev => ({ ...prev, [instanceId]: true }));
    
    try {
      // Get the instance family (e.g., extract "t2" from "t2.micro")
      const instanceFamily = instance.type?.split('.')[0] || '';
      
      // Set the input value (this will be debounced and reflected in typeQuery)
      setInputValue(instanceFamily);
      
      // Get instance types based on the search query
      const response = await fetch(`/api/instance-types?query=${instanceFamily}`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableInstanceTypes(prev => ({ 
          ...prev, 
          [instanceId]: data.instanceTypes 
        }));
        
        // If there is a current alternative type, select it; otherwise, set to empty
        setSelectedAlternativeType(prev => ({ 
          ...prev, 
          [instanceId]: instance.alternativeType && instance.alternativeType !== '未登録' ? instance.alternativeType : '' 
        }));
      } else {
        console.error('Failed to get instance types');
        // Set empty array when acquisition fails
        setAvailableInstanceTypes(prev => ({ ...prev, [instanceId]: [] }));
      }
    } catch (error) {
      console.error('Error occured during getting instance type:', error);
    } finally {
      setIsLoading(prev => ({ ...prev, [instanceId]: false }));
    }
  };

  // Set the selected alternative type when an option is selected
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
      setEditingInstanceId(null); // Exit edit mode
    }
  };
  
  // Fetcher for schedules
  const scheduleFetcher = useFetcher<{ 
    schedules?: Array<Schedule>,
    error?: string 
  }>();
  
  // Process the result of scheduleFetcher
  useEffect(() => {
    // Use the ID of the currently selected instance
    if (selectedInstanceForSchedule?.id) {
      const instanceId = selectedInstanceForSchedule.id;
      
      // Update loading state
      if (scheduleFetcher.state === 'loading') {
        setIsScheduleLoading(prev => ({
          ...prev,
          [instanceId]: true
        }));
      } else if (scheduleFetcher.state === 'idle' && scheduleFetcher.data) {
        // Update schedule data
        if (scheduleFetcher.data.schedules) {
          setSchedules(prev => ({
            ...prev,
            [instanceId]: scheduleFetcher.data?.schedules || []
          }));
        }
        
        // Update loading state
        setIsScheduleLoading(prev => ({
          ...prev,
          [instanceId]: false
        }));
      }
    }
  }, [scheduleFetcher.data, scheduleFetcher.state, selectedInstanceForSchedule]);

  // Add schedule
  const handleAddSchedule = () => {
    if (!selectedInstanceForSchedule) return;
    
    const instanceId = selectedInstanceForSchedule.id || '';
    const inputs = newScheduleInputs[instanceId] || { action: 'start', cron: '', description: '' };
    
    if (!inputs.cron) return;
    
    // Update state to loading
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
    
    // Create schedule using useFetcher
    scheduleFetcher.submit(formData, {
      method: 'post',
      action: '/api/schedules'
    });
    
    // Reset the form
    setNewScheduleInputs(prev => ({
      ...prev,
      [instanceId]: { action: 'start', cron: '', description: '' }
    }));

    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: false
    }));
  };

  // Delete schedule
  const handleDeleteSchedule = (instanceId: string, scheduleName: string) => {
    // Update state to loading
    setIsScheduleLoading(prev => ({
      ...prev,
      [instanceId]: true
    }));
    
    const formData = new FormData();
    formData.append('actionType', 'delete');
    formData.append('instanceId', instanceId);
    formData.append('groupId', instances.find(i => i.id === instanceId)?.groupId || '');
    formData.append('scheduleName', scheduleName);
    
    // Delete schedule using useFetcher
    scheduleFetcher.submit(formData, {
      method: 'post',
      action: '/api/schedules'
    });
    
    // Delete from the schedule list (optimistic UI update)
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
              // Manage schedule-related state for each instance
              
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
                          // Display dropdown in edit mode
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
                          // Normal display mode
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

      {/* Schedule management section */}
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


      {/* List of ECS services */}
      <ServiceList 
        services={services} 
        isSubmitting={isSubmitting}
        onRefresh={handleRefresh}
      />

      {/* List of RDS Clusters/Instances */}
      <DatabaseList 
        databases={databases} 
        isSubmitting={isSubmitting}
        onRefresh={handleRefresh}
        actionFetcher={actionFetcher}
      />

      {/* Error */}
      <ErrorAlert
        isVisible={isErrorAlertVisible}
        message={errorMessage}
        onClose={() => setIsErrorAlertVisible(false)}
      />
    </div>
  );
}
