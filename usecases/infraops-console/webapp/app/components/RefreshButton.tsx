import React, { useState } from 'react';
import { Button } from '~/components';

interface RefreshButtonProps {
  onRefresh: () => void;
  isSubmitting?: boolean;
  className?: string;
}

export const RefreshButton: React.FC<RefreshButtonProps> = ({
  onRefresh,
  isSubmitting = false,
  className = ''
}) => {
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 5000);
  };

  return (
    <Button
      type="button"
      variant="text"
      size="sm"
      onClick={handleRefresh}
      disabled={isSubmitting || isRefreshing}
      className={className}
    >
      {isRefreshing ? "更新中..." : "更新"}
    </Button>
  );
};

export default RefreshButton;
