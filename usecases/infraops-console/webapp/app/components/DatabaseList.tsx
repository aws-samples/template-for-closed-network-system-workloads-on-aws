import React, { useState } from 'react';
import type { FetcherWithComponents } from '@remix-run/react';
import type { Database } from '../models/rds.server';
import type { AppError } from '../utils/error.server';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeaderCell, 
  TableRow,
  StatusBadge,
  RefreshButton,
  Button
} from '../components';

interface DatabaseListProps {
  databases: Database[];
  isSubmitting?: boolean;
  onRefresh?: () => void;
  actionFetcher?: FetcherWithComponents<{
    success?: boolean;
    error?: AppError;
  }>;
  user?: { isAdmin: boolean };
}

const getClusterAction = (status: string): { action: string | null, label: string | null } => {
  const lowerStatus = status.toLowerCase();
  
  if (lowerStatus === 'available') {
    return { action: 'stop', label: '一時停止' };
  } else if (lowerStatus === 'stopped') {
    return { action: 'start', label: '再開' };
  } else {
    return { action: null, label: null };
  }
};

export const DatabaseList: React.FC<DatabaseListProps> = ({ 
  databases, 
  isSubmitting = false,
  onRefresh,
  actionFetcher,
  user
}) => {
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  const toggleClusterExpansion = (clusterId: string) => {
    const newExpanded = new Set(expandedClusters);
    if (newExpanded.has(clusterId)) {
      newExpanded.delete(clusterId);
    } else {
      newExpanded.add(clusterId);
    }
    setExpandedClusters(newExpanded);
  };

  const renderDatabaseRow = (database: Database, isChild = false) => {
    const isExpanded = expandedClusters.has(database.identifier);
    const hasChildren = database.children && database.children.length > 0;

    return (
      <React.Fragment key={database.arn}>
        <TableRow className={isChild ? 'bg-gray-50' : ''}>
          <TableCell>
            <div className={`flex items-center ${isChild ? 'pl-8' : ''}`}>
              {/* Expand/collapse button for clusters with children */}
              {hasChildren && !isChild && (
                <button
                  onClick={() => toggleClusterExpansion(database.identifier)}
                  className="mr-2 p-1 hover:bg-gray-200 rounded"
                  aria-label={isExpanded ? "折りたたむ" : "展開する"}
                >
                  {isExpanded ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              )}
              
              {/* Indent line for child instances */}
              {isChild && (
                <div className="mr-2 flex items-center">
                  <div className="w-4 h-4 border-l-2 border-b-2 border-gray-300"></div>
                </div>
              )}
              
              <span className={isChild ? 'text-sm' : ''}>{database.identifier}</span>
            </div>
          </TableCell>
          <TableCell className={isChild ? 'text-sm' : ''}>{database.engine}</TableCell>
          <TableCell>
            <StatusBadge status={database.status.toLowerCase()} />
          </TableCell>
          <TableCell className={isChild ? 'text-sm' : ''}>{database.role}</TableCell>
          {user?.isAdmin && <TableCell className={isChild ? 'text-sm' : ''}>{database.groupId || '未設定'}</TableCell>}
          <TableCell>
            {database.isSelectable ? (
              <div className="flex space-x-2">
                {(() => {
                  const { action, label } = getClusterAction(database.status);
                  
                  if (action && label) {
                    return (
                      <Button 
                        variant="text" 
                        size="xs"
                        disabled={isSubmitting || (actionFetcher?.state === 'submitting')}
                        onClick={() => {
                          if (actionFetcher) {
                            const formData = new FormData();
                            if (database.type === 'cluster') {
                              formData.append('dbClusterIdentifier', database.identifier);
                              formData.append('action', action === 'stop' ? 'stopDBCluster' : 'startDBCluster');
                            } else {
                              // For standalone instances, we would need to implement instance-specific actions
                              formData.append('dbInstanceIdentifier', database.identifier);
                              formData.append('action', action === 'stop' ? 'stopDBInstance' : 'startDBInstance');
                            }
                            actionFetcher.submit(formData, { method: 'post' });
                          }
                        }}
                      >
                        {label}
                      </Button>
                    );
                  } else if (database.status.toLowerCase() !== 'available' && database.status.toLowerCase() !== 'stopped') {
                    return <span className="text-sm text-gray-500">処理中...</span>;
                  }
                  
                  return null;
                })()}
              </div>
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
          </TableCell>
        </TableRow>
        
        {/* Render child instances if cluster is expanded */}
        {hasChildren && isExpanded && database.children?.map(child => 
          renderDatabaseRow(child, true)
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="mt-8">
      <h2>データベース ({databases.length})</h2>
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
            <TableHeaderCell>DB識別子</TableHeaderCell>
            <TableHeaderCell>エンジン</TableHeaderCell>
            <TableHeaderCell>ステータス</TableHeaderCell>
            <TableHeaderCell>ロール</TableHeaderCell>
            {user?.isAdmin && <TableHeaderCell>グループID</TableHeaderCell>}
            <TableHeaderCell>アクション</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {databases.map(database => renderDatabaseRow(database))}
          {databases.length === 0 && (
            <TableRow>
              <TableCell colSpan={user?.isAdmin ? 6 : 5}>データベースが見つかりません</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default DatabaseList;
