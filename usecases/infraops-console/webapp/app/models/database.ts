/**
 * RDS DB cluster type definition
 * Represents basic information of RDS DB cluster
 */
export type Database = {
  identifier: string;
  status: string;
  role: string;
  engine: string;
  endpoint?: string;
  arn: string;
}
