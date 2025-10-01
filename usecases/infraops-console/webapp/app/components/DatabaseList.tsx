import React from 'react';
import type { FetcherWithComponents } from '@remix-run/react';
import type { Database } from '~/models/database';
import type { AppError } from '~/utils/error.server';
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
} from '~/components';

interface DatabaseListProps {
  databases: Database[];
  isSubmitting?: boolean;
  onRefresh?: () => void;
  actionFetcher?: FetcherWithComponents<{
    success?: boolean;
    error?: AppError;
  }>;
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
  actionFetcher
}) => {
  return (
    <div className="mt-8">
      <h2>RDS DBクラスター一覧</h2>
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
            <TableHeaderCell>アクション</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {databases.map(database => (
            <TableRow key={database.arn}>
              <TableCell>{database.identifier}</TableCell>
              <TableCell>{database.engine}</TableCell>
              <TableCell>
                <StatusBadge status={database.status.toLowerCase()} />
              </TableCell>
              <TableCell>{database.role}</TableCell>
              <TableCell>
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
                              formData.append('dbClusterIdentifier', database.identifier);
                              formData.append('action', action === 'stop' ? 'stopDBCluster' : 'startDBCluster');
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
              </TableCell>
            </TableRow>
          ))}
          {databases.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>RDS DBクラスターが見つかりません</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default DatabaseList;
