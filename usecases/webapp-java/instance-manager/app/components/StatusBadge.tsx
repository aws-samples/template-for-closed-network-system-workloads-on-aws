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
      // 正常・利用可能状態
      case 'running':
      case 'success':
      case 'active':
      case 'available':
        return 'bg-green-100 text-green-800';
      
      // 停止状態
      case 'stopped':
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      
      // 処理中・警告状態（黄色）
      case 'pending':
      case 'warning':
      case 'creating':
      case 'modifying':
      case 'upgrading':
      case 'backing-up':
      case 'maintenance':
      case 'starting':
      case 'renaming':
      case 'migrating':
      case 'promoting':
        return 'bg-yellow-100 text-yellow-800';
      
      // 処理中・注意状態（オレンジ）
      case 'stopping':
      case 'draining':
      case 'deleting':
      case 'rebooting':
      case 'resetting-master-credentials':
      case 'failing-over':
        return 'bg-orange-100 text-orange-800';
      
      // エラー状態
      case 'error':
      case 'failed':
      case 'inaccessible-encryption-credentials':
        return 'bg-red-100 text-red-800';
      
      // 情報状態
      case 'info':
        return 'bg-blue-100 text-blue-800';
      
      // その他
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // ステータスラベルの取得
  const getStatusLabel = (status: string) => {
    if (label) return label;
    
    switch (status.toLowerCase()) {
      // EC2インスタンスのステータス
      case 'running':
        return '実行中';
      case 'stopped':
        return '停止';
      case 'pending':
        return '起動中';
      case 'stopping':
        return '停止中';
      
      // 一般的なステータス
      case 'error':
        return 'エラー';
      case 'success':
        return '成功';
      case 'warning':
        return '警告';
      case 'info':
        return '情報';
      case 'active':
        return 'アクティブ';
      case 'draining':
        return 'ドレイン中';
      case 'inactive':
        return '非アクティブ';
      
      // RDSインスタンス/クラスターのステータス
      case 'available':
        return '利用可能';
      case 'creating':
        return '作成中';
      case 'deleting':
        return '削除中';
      case 'failed':
        return '失敗';
      case 'modifying':
        return '変更中';
      case 'rebooting':
        return '再起動中';
      case 'resetting-master-credentials':
        return '認証情報リセット中';
      case 'upgrading':
        return 'アップグレード中';
      
      // Auroraクラスター固有のステータス
      case 'backing-up':
        return 'バックアップ中';
      case 'failing-over':
        return 'フェイルオーバー中';
      case 'maintenance':
        return 'メンテナンス中';
      case 'migrating':
        return '移行中';
      case 'promoting':
        return '昇格中';
      case 'renaming':
        return '名前変更中';
      case 'starting':
        return '起動中';
      case 'inaccessible-encryption-credentials':
        return '暗号化キーアクセス不可';
      
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
