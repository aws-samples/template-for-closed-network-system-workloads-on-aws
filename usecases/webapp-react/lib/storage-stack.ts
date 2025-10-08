import { CfnOutput, StackProps, Stack, aws_ec2, aws_rds, aws_ssm } from 'aws-cdk-lib';
import { DatabaseClusterEngine, AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { Aurora } from './construct/aurora/aurora';

interface StorageStackProps extends StackProps {
  vpc: aws_ec2.Vpc;
  sharedNetworkStackName: string; // 共有ネットワークスタックの名前
  windowsBastion: boolean; // Windowsバスティオンの有無
  linuxBastion: boolean; // Linuxバスティオンの有無
}

export class StorageStack extends Stack {
  public readonly dbCluster: aws_rds.DatabaseCluster | aws_rds.ServerlessCluster;
  public readonly dbEncryptionKeyArn: string;
  public readonly dbProxy: aws_rds.DatabaseProxy;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Create Aurora
    const aurora = new Aurora(this, 'Aurora', {
      enabledServerless: false,
      enabledProxy: true,
      auroraEdition: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_4,
      }),
      vpc: props.vpc,
      dbUserName: 'postgres',
    });
    this.dbCluster = aurora.aurora;
    this.dbEncryptionKeyArn = aurora.databaseCredentials.encryptionKey!.keyArn;
    this.dbProxy = aurora.proxy;

    // SSMパラメータからバスティオンIPを取得してセキュリティグループルールを設定
    if (props.windowsBastion) {
      try {
        const windowsBastionIp = aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/${props.sharedNetworkStackName}/WindowsBastionIp`
        );
        
        this.dbCluster.connections.allowDefaultPortFrom(
          aws_ec2.Peer.ipv4(`${windowsBastionIp}/32`),
          'Allow access from Windows Bastion'
        );
      } catch (error) {
        console.warn('Windows Bastion IP parameter not found. Skipping security group rule.');
      }
    }

    if (props.linuxBastion) {
      try {
        const linuxBastionIp = aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/${props.sharedNetworkStackName}/LinuxBastionIp`
        );
        
        this.dbCluster.connections.allowDefaultPortFrom(
          aws_ec2.Peer.ipv4(`${linuxBastionIp}/32`),
          'Allow access from Linux Bastion'
        );
      } catch (error) {
        console.warn('Linux Bastion IP parameter not found. Skipping security group rule.');
      }
    }

    new CfnOutput(this, 'AuroraEdition', {
      exportName: 'AuroraEdition',
      value: 'postgresql',
    });
  }
}
