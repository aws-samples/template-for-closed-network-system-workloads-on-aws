/**
 * RDS DBクラスター型の定義
 * RDS DBクラスターの基本情報を表す
 */
export type Database = {
  identifier: string;
  status: string;
  role: string;
  engine: string;
  endpoint?: string;
  arn: string;
}
