import React from 'react';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Button, Modal } from '~/components';

// Instanceの型定義
type Instance = {
  id: string | undefined;
  state: string | undefined;
  type: string | undefined;
  alternativeType: string | undefined;
  name: string;
  groupId: string | null;
}

interface AlternativeTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInstance: Instance | null;
  availableInstanceTypes: string[];
  selectedAlternativeType: string;
  setSelectedAlternativeType: (value: string) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  typeQuery: string;
  isLoading: boolean;
  isSubmitting: boolean;
  onSave: () => void;
}

const AlternativeTypeModal: React.FC<AlternativeTypeModalProps> = ({
  isOpen,
  onClose,
  selectedInstance,
  availableInstanceTypes,
  selectedAlternativeType,
  setSelectedAlternativeType,
  inputValue,
  setInputValue,
  typeQuery,
  isLoading,
  isSubmitting,
  onSave
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="代替タイプの設定"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="solid-fill"
            size="sm"
            onClick={onSave}
            disabled={isSubmitting || !selectedAlternativeType}
          >
            保存
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p>インスタンス: {selectedInstance?.name} ({selectedInstance?.id})</p>
          <p>現在のタイプ: {selectedInstance?.type}</p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="alternativeType" className="block text-sm font-medium text-gray-700 mb-1">
                代替タイプ
              </label>
              <Combobox 
                value={selectedAlternativeType} 
                onChange={(value: string | null) => setSelectedAlternativeType(value || '')}
              >
                <div className="relative mt-1">
                  <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left border border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-300">
                    <ComboboxInput
                      className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0"
                      displayValue={(type:string) => type}
                      onChange={(event) => setInputValue(event.target.value)}
                      placeholder="タイプを検索..."
                    />
                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </ComboboxButton>
                  </div>
                  <ComboboxOptions className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-10">
                    {availableInstanceTypes.filter(type => 
                      typeQuery === '' || type.toLowerCase().includes(typeQuery.toLowerCase())
                    ).length === 0 ? (
                      <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                        該当するタイプがありません
                      </div>
                    ) : (
                      availableInstanceTypes
                        .filter(type => typeQuery === '' || type.toLowerCase().includes(typeQuery.toLowerCase()))
                        .map((type) => (
                        <ComboboxOption
                          key={type}
                          className='relative cursor-default select-none py-2 pl-10 pr-4 text-gray-900'
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
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
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
            </div>
          </div>
          
          <p className="text-sm text-gray-500">
            代替タイプを設定すると、インスタンスのAlternativeTypeタグに値が保存されます。
          </p>
        </div>
      )}
    </Modal>
  );
};

export default AlternativeTypeModal;
