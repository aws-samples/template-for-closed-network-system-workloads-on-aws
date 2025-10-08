import React from 'react';
import { Button } from '.';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from './Table';
import StatusBadge from './StatusBadge';
import type { Schedule } from '../models/scheduler.server';

interface ScheduleFormProps {
  schedules: Schedule[];
  newScheduleAction: 'start' | 'stop';
  setNewScheduleAction: (action: 'start' | 'stop') => void;
  newScheduleCron: string;
  setNewScheduleCron: (cron: string) => void;
  newScheduleDescription: string;
  setNewScheduleDescription: (description: string) => void;
  isLoading: boolean;
  isSubmitting: boolean;
  onAddSchedule: () => void;
  onDeleteSchedule: (scheduleName: string) => void;
}

const ScheduleForm: React.FC<ScheduleFormProps> = ({
  schedules,
  newScheduleAction,
  setNewScheduleAction,
  newScheduleCron,
  setNewScheduleCron,
  newScheduleDescription,
  setNewScheduleDescription,
  isLoading,
  isSubmitting,
  onAddSchedule,
  onDeleteSchedule
}) => {
  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <>
          {/* List of existed schedules */}
          <div>
            <h4 className="font-medium mb-2">登録済みスケジュール</h4>
            {schedules.length === 0 ? (
              <p className="text-gray-500">登録されているスケジュールはありません</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>スケジュール動作</TableHeaderCell>
                    <TableHeaderCell>名前</TableHeaderCell>
                    <TableHeaderCell>Cron式</TableHeaderCell>
                    <TableHeaderCell align="right">アクション</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schedules.map(schedule => (
                    <TableRow key={schedule.name}>
                      <TableCell>
                        <StatusBadge 
                          status={schedule.action === 'start' ? 'success' : 'stopped'} 
                          label={schedule.action === 'start' ? '起動' : '停止'} 
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{schedule.description}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">{schedule.cronExpression}</span>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          type="button"
                          variant="text"
                          size="xs"
                          onClick={() => onDeleteSchedule(schedule.name)}
                          disabled={isSubmitting}
                        >
                          削除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          
          {/* Form of new schedule */}
          <div>
            <h4 className="font-medium">新規スケジュール追加</h4>
            <span className="text-xs text-gray-500">例: 毎週月〜金の午前8時に実行する場合は「0 8 ? * MON-FRI *」と入力してください。</span>
            <div className="space-y-3">
              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newScheduleDescription}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewScheduleDescription(e.target.value)}
                    placeholder="毎週月〜金の午前8時に起動"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    アクション <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newScheduleAction}
                    onChange={(e) => setNewScheduleAction(e.target.value as 'start' | 'stop')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="start">起動</option>
                    <option value="stop">停止</option>
                  </select>
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cron式 <span className="text-red-500">*</span> 
                  </label>
                  <input
                    type="text"
                    value={newScheduleCron}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewScheduleCron(e.target.value)}
                    placeholder="0 8 ? * MON-FRI *"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    &nbsp;
                  </label>
                  <Button
                    type="button"
                    variant="solid-fill"
                    size="sm"
                    onClick={onAddSchedule}
                    disabled={isSubmitting || !newScheduleCron || !newScheduleDescription}
                    className="boder rounded-md px-3 py-2"
                  >
                    スケジュール追加
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ScheduleForm;
