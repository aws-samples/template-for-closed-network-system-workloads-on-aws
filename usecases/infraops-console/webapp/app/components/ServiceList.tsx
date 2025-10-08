import React, { useState } from 'react';
import { useFetcher } from '@remix-run/react';
import type { Service } from '../models/ecs.server';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeaderCell, 
  TableRow,
  StatusBadge,
  RefreshButton,
  Input
} from '../components';

interface ServiceListProps {
  services: Service[];
  isSubmitting?: boolean;
  onRefresh?: () => void;
  user?: { isAdmin: boolean };
}

export const ServiceList: React.FC<ServiceListProps> = ({ 
  services, 
  isSubmitting = false,
  onRefresh,
  user
}) => {
  // Manage the service ID being edited
  const [editingServiceArn, setEditingServiceArn] = useState<string | null>(null);
  // Manage the task count being edited
  const [editingDesiredCount, setEditingDesiredCount] = useState<number>(0);
  const fetcher = useFetcher();
  
  // Start edit mode
  const handleStartEdit = (service: Service) => {
    setEditingServiceArn(service.serviceArn);
    setEditingDesiredCount(service.desiredCount);
  };
  
  // Cancel edit
  const handleCancelEdit = () => {
    setEditingServiceArn(null);
  };
  
  // Save task count
  const handleSaveDesiredCount = (service: Service) => {
    const formData = new FormData();
    formData.append('action', 'updateDesiredCount');
    formData.append('clusterArn', service.clusterArn);
    formData.append('serviceArn', service.serviceArn);
    formData.append('desiredCount', editingDesiredCount.toString());
    
    fetcher.submit(formData, {
      method: 'post',
      action: '/api/services'
    });
    
    // End edit mode
    setEditingServiceArn(null);
    
    // Optimistic UI update (update display without waiting for actual API response)
    // Note: When the actual API response returns, call onRefresh to get the latest state
    setTimeout(() => {
      if (onRefresh) onRefresh();
    }, 1000);
  };
  return (
    <div className="mt-8">
      <h2>ECSサービス一覧</h2>
      <div className="flex justify-end mb-4">
        {onRefresh && (
          <RefreshButton 
            onRefresh={onRefresh}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>サービス名</TableHeaderCell>
            <TableHeaderCell>クラスター</TableHeaderCell>
            <TableHeaderCell>ステータス</TableHeaderCell>
            {user?.isAdmin && <TableHeaderCell>グループID</TableHeaderCell>}
            <TableHeaderCell>実行中タスク / 希望タスク数</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {services.map(service => (
            <TableRow key={service.serviceArn}>
              <TableCell>{service.name}</TableCell>
              <TableCell>{service.clusterName}</TableCell>
              <TableCell>
                <StatusBadge status={service.status.toLowerCase()} />
              </TableCell>
              {user?.isAdmin && <TableCell>{service.groupId || '未設定'}</TableCell>}
              <TableCell>
                <div className="flex items-center space-x-2">
                  <span>{service.runningCount} / </span>
                  
                  {editingServiceArn === service.serviceArn ? (
                    // Edit mode
                    <div className="flex items-center space-x-2">
                      <Input
                        type="number"
                        min="0"
                        value={editingDesiredCount}
                        onChange={(e) => setEditingDesiredCount(parseInt(e.target.value, 10))}
                        blockSize="sm"
                        className="w-16"
                        disabled={fetcher.state !== 'idle'}
                      />
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleSaveDesiredCount(service)}
                          className="text-gray-500 hover:text-green-600 focus:outline-none"
                          title="Save"
                          disabled={fetcher.state !== 'idle'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-gray-500 hover:text-red-600 focus:outline-none"
                          title="Cancel"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Normal display mode
                    <div className="flex items-center space-x-1">
                      <span>{service.desiredCount}</span>
                      <button
                        onClick={() => handleStartEdit(service)}
                        className="text-gray-500 hover:text-blue-600 focus:outline-none"
                        disabled={isSubmitting || fetcher.state !== 'idle' || editingServiceArn !== null}
                        title="Change task count"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {services.length === 0 && (
            <TableRow>
              <TableCell colSpan={user?.isAdmin ? 5 : 4}>ECSサービスが見つかりません</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ServiceList;
