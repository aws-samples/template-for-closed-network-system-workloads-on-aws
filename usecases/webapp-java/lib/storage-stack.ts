import { CfnOutput, StackProps, Stack, aws_ec2, aws_iam, aws_rds } from 'aws-cdk-lib';
import { DatabaseClusterEngine, AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { Aurora } from './construct/aurora/aurora';

interface StorageStackProps extends StackProps {
  vpc: aws_ec2.Vpc;
}

export class StorageStack extends Stack {
  public readonly dbCluster: aws_rds.DatabaseCluster | aws_rds.ServerlessCluster;
  public readonly dbEncryptionKeyArn: string;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Create Aurora
    const aurora = new Aurora(this, 'Aurora', {
      enabledServerless: false,
      enabledProxy: false, // If you want to use Lambda Proxy.
      auroraEdition: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_4,
      }),
      vpc: props.vpc,
      dbUserName: 'postgres',
    });
    this.dbCluster = aurora.aurora;
    this.dbEncryptionKeyArn = aurora.databaseCredentials.encryptionKey!.keyArn;

    new CfnOutput(this, 'AuroraEdition', {
      exportName: 'AuroraEdition',
      value: 'postgresql',
    });
  }
}
