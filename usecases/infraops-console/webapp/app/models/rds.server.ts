import { rdsClient } from '~/utils/aws.server';

/**
 * RDS Database type definition
 * Represents both DB clusters and DB instances with hierarchical structure
 */
export type Database = {
  identifier: string;
  status: string;
  role: string;
  engine: string;
  endpoint?: string;
  arn: string;
  type: 'cluster' | 'instance';
  parentClusterId?: string;
  isSelectable: boolean;
  children?: Database[];
  isExpanded?: boolean;
}

/**
 * Get list of RDS databases (clusters and instances) with hierarchical structure
 * @param request Request object for authentication
 * @returns Array of Database objects with hierarchical structure
 */
export async function getDatabases(request: Request): Promise<Database[]> {
  let databases: Database[] = [];
  
  try {
    // Get DB clusters and instances in parallel
    const [clustersResult, instancesResult] = await Promise.all([
      rdsClient.describeDBClusters(request),
      rdsClient.describeDBInstances(request)
    ]);

    const { DBClusters } = clustersResult;
    const { DBInstances } = instancesResult;

    // Create cluster objects
    const clusters: Database[] = DBClusters?.map(cluster => ({
      identifier: cluster.DBClusterIdentifier || '',
      status: cluster.Status || '',
      role: 'リージョン別クラスター',
      engine: cluster.Engine || '',
      endpoint: cluster.Endpoint,
      arn: cluster.DBClusterArn || '',
      type: 'cluster' as const,
      isSelectable: true,
      children: [],
      isExpanded: true
    })) || [];

    // Create instance objects and categorize them
    const instances: Database[] = DBInstances?.map(instance => {
      const parentClusterId = instance.DBClusterIdentifier;
      let role = 'インスタンス';
      
      // Determine role based on cluster membership and read replica status
      if (parentClusterId) {
        // Instance belongs to a cluster
        if (instance.ReadReplicaSourceDBInstanceIdentifier) {
          role = 'リーダーインスタンス';
        } else {
          // Check if it's a writer instance (primary)
          const cluster = DBClusters?.find(c => c.DBClusterIdentifier === parentClusterId);
          if (cluster?.DatabaseName === instance.DBName) {
            role = 'ライターインスタンス';
          } else {
            role = 'リーダーインスタンス';
          }
        }
      }

      return {
        identifier: instance.DBInstanceIdentifier || '',
        status: instance.DBInstanceStatus || '',
        role,
        engine: instance.Engine || '',
        endpoint: instance.Endpoint?.Address,
        arn: instance.DBInstanceArn || '',
        type: 'instance' as const,
        parentClusterId,
        isSelectable: !parentClusterId, // Only standalone instances are selectable
      };
    }) || [];

    // Build hierarchical structure
    clusters.forEach(cluster => {
      cluster.children = instances.filter(instance => 
        instance.parentClusterId === cluster.identifier
      );
    });

    // Get standalone instances (not part of any cluster)
    const standaloneInstances = instances.filter(instance => !instance.parentClusterId);

    // Combine clusters and standalone instances
    databases = [...clusters, ...standaloneInstances];

  } catch (error) {
    console.error('Error fetching RDS databases:', error);
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
