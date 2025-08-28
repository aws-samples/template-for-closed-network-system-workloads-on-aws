import React from 'react';

type StatusType = 'running' | 'stopped' | 'pending' | 'stopping' | 'error' | 'success' | 'warning' | 'info';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  label, 
  className = '' 
}) => {
  // ステータスに基づくスタイル
  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-gray-100 text-gray-800';
      case 'pending':
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'stopping':
        return 'bg-orange-100 text-orange-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // ステータスラベルの取得
  const getStatusLabel = (status: string) => {
    if (label) return label;
    
    switch (status.toLowerCase()) {
      case 'running':
        return '実行中';
      case 'stopped':
        return '停止';
      case 'pending':
        return '起動中';
      case 'stopping':
        return '停止中';
      case 'error':
        return 'エラー';
      case 'success':
        return '成功';
      case 'warning':
        return '警告';
      case 'info':
        return '情報';
      default:
        return status;
    }
  };

  const statusStyle = getStatusStyle(status);
  const statusLabel = getStatusLabel(status);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${statusStyle} ${className}`}>
      {statusLabel}
    </span>
  );
};

export default StatusBadge;
