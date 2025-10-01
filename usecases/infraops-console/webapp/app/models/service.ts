/**
 * ECS service type definition
 * Represents basic information of ECS service
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
