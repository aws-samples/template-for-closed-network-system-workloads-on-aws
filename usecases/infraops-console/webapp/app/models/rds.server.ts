import { rdsClient } from '~/utils/aws.server';

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

/**
 * Get list of RDS DB clusters
 * @param request Request object for authentication
 * @returns Array of Database objects
 */
export async function getDatabases(request: Request): Promise<Database[]> {
  let databases: Database[] = [];
  
  try {
    const { DBClusters } = await rdsClient.describeDBClusters(request);
    
    // Format DB cluster information
    databases = DBClusters?.map(cluster => {
      // Check status
      let status = cluster.Status || '';
      
      // Check role of DBs
      let role = 'クラスター';
      
      return {
        identifier: cluster.DBClusterIdentifier || '',
        status,
        role,
        engine: cluster.Engine || '',
        endpoint: cluster.Endpoint,
        arn: cluster.DBClusterArn || ''
      };
    }) || [];
  } catch (error) {
    console.error('Error fetching RDS DB clusters:', error);
  }
  
  return databases;
}

/**
 * Stop RDS DB cluster
 * @param dbClusterIdentifier DB cluster identifier
 * @param request Request object for authentication
 */
export async function stopDatabase(dbClusterIdentifier: string, request: Request): Promise<void> {
  try {
    await rdsClient.stopDBCluster({ dbClusterIdentifier }, request);
  } catch (error) {
    console.error('Error stopping DB cluster:', error);
    throw new Error('Failed to stop database');
  }
}

/**
 * Start RDS DB cluster
 * @param dbClusterIdentifier DB cluster identifier
 * @param request Request object for authentication
 */
export async function startDatabase(dbClusterIdentifier: string, request: Request): Promise<void> {
  try {
    await rdsClient.startDBCluster({ dbClusterIdentifier }, request);
  } catch (error) {
    console.error('Error starting DB cluster:', error);
    throw new Error('Failed to start database');
  }
}
