import { CfnOutput, StackProps, Stack, aws_codecommit, aws_ec2 } from 'aws-cdk-lib';
import { DatabaseClusterEngine, AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

// Constructs
import { Network } from './constructs/network/network';
import { Aurora } from './constructs/aurora/aurora';
import { Ecr } from './constructs/ecr/ecr';

export class BaseStack extends Stack {
  public readonly vpc: aws_ec2.Vpc;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create networking resources
    const network = new Network(this, `AppVpc`, {
      cidr: '10.0.0.0/16',
      cidrMask: 24,
      publicSubnet: false,
      isolatedSubnet: true,
      maxAzs: 2,
    });
    this.vpc = network.vpc;

    // Create Aurora
    new Aurora(this, 'Aurora', {
      enabledServerless: false,
      enabledProxy: false,
      auroraEdition: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_12_9,
      }),
      vpc: network.vpc,
      dbUserName: 'postgres',
    });

    // Create ECR
    new Ecr(this, 'Webapp').containerRepository;
    new Ecr(this, 'Batch').containerRepository;

    // Create Pipeline
    const codecommitRepository = new aws_codecommit.Repository(this, 'WebappSourceRepository', {
      repositoryName: `${id.toLowerCase()}-webapp-source`,
    });
    new CfnOutput(this, 'SourceRepositoryName', {
      exportName: 'WebappSourceRepositoryName',
      value: codecommitRepository.repositoryName,
    });
  }
}
