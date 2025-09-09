import React from 'react';
import { Button, Modal } from '~/components';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage: string | null;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  errorMessage
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="エラー"
      footer={
        <Button
          type="button"
          variant="solid-fill"
          size="sm"
          onClick={onClose}
        >
          閉じる
        </Button>
      }
    >
      <div className="text-red-600">
        {errorMessage}
      </div>
    </Modal>
  );
};

export default ErrorModal;
