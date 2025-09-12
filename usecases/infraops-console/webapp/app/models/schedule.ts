/**
 * スケジュール型の定義
 * EC2インスタンスの起動・停止スケジュールを表す
 */
export type Schedule = {
  name: string;
  action: 'start' | 'stop';
  description: string;
  cronExpression: string;
}
