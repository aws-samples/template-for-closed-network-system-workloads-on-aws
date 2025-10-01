/**
 * Schedule type definition
 * Represents EC2 instance start/stop schedule
 */
export type Schedule = {
  name: string;
  action: 'start' | 'stop';
  description: string;
  cronExpression: string;
}
