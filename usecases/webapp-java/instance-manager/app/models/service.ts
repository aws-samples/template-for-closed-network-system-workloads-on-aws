/**
 * ECSサービス型の定義
 * ECSサービスの基本情報を表す
 */
export type Service = {
  name: string;
  status: string;
  runningCount: number;
  desiredCount: number;
  clusterName: string;
  clusterArn: string;
  serviceArn: string;
}
