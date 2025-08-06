import { aws_rds, RemovalPolicy, CfnOutput, aws_iam, aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EncryptionKey } from '../kms/key';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';

export class Aurora extends Construct {
  public readonly aurora: aws_rds.DatabaseCluster | aws_rds.ServerlessCluster;
  public readonly proxy: aws_rds.DatabaseProxy;
  public readonly databaseCredentials: aws_rds.Credentials;
  public readonly proxyRole: aws_iam.Role;
  constructor(
    scope: Construct,
    id: string,
    props: {
      enabledServerless: boolean;
      auroraEdition: aws_rds.IClusterEngine;
      vpc: aws_ec2.Vpc;
      dbUserName: string;
      enabledProxy?: boolean;
    }
  ) {
    super(scope, id);

    // Check whether isolated subnets which you chose or not
    if (!props.vpc.isolatedSubnets || props.vpc.isolatedSubnets.length < 1) {
      throw new Error('You should specify the isolated subnets in subnets');
    }

    const secretName = 'AuroraSecret';
    this.databaseCredentials = aws_rds.Credentials.fromGeneratedSecret(props.dbUserName, {
      secretName,
      encryptionKey: new EncryptionKey(this, 'AuroraSecretEncryptionKey', {
        servicePrincipals: [new ServicePrincipal('secretsmanager.amazonaws.com')],
      }).encryptionKey,
    });

    // Add VPC Endpoint to use SecretRotation
    props.vpc.addInterfaceEndpoint('SecretsmanagerEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    if (props.enabledServerless) {
      this.aurora = new aws_rds.ServerlessCluster(this, 'Serverless', {
        engine: props.auroraEdition,
        vpc: props.vpc,
        vpcSubnets: {
          subnets: props.vpc.isolatedSubnets,
        },
        credentials: this.databaseCredentials,
        removalPolicy: RemovalPolicy.DESTROY, // For development env only
        deletionProtection: false, // In production, we have to set true.
      });
    } else {
      this.aurora = new aws_rds.DatabaseCluster(this, `Cluster`, {
        engine: props.auroraEdition,
        iamAuthentication: true,
        vpc: props.vpc,
        vpcSubnets: {
          subnets: props.vpc.isolatedSubnets,
        },
        writer: aws_rds.ClusterInstance.provisioned('Writer', {
          instanceType: aws_ec2.InstanceType.of(
            aws_ec2.InstanceClass.T3,
            aws_ec2.InstanceSize.MEDIUM
          ),
        }),
        readers: [
          aws_rds.ClusterInstance.provisioned('Reader', {
            instanceType: aws_ec2.InstanceType.of(
              aws_ec2.InstanceClass.T3,
              aws_ec2.InstanceSize.MEDIUM
            ),
          }),
        ],
        storageEncrypted: true,
        credentials: this.databaseCredentials,
        removalPolicy: RemovalPolicy.DESTROY, // For development env only
        deletionProtection: false, // In production, we have to set true.
        parameters: {
          'rds.force_ssl': '1',
        },
        cloudwatchLogsExports: ['postgresql'],
      });

      if (props.enabledProxy && this.aurora.secret) {
        this.proxyRole = new aws_iam.Role(this, 'RdsProxyRole', {
          assumedBy: new aws_iam.ServicePrincipal('rds.amazonaws.com'),
        });

        this.proxy = this.aurora.addProxy('RdsProxy', {
          vpc: props.vpc,
          iamAuth: true,
          secrets: [this.aurora.secret],
          securityGroups: this.aurora.connections.securityGroups,
        });

        this.proxy.grantConnect(this.proxyRole);
      }
    }

    this.aurora.addRotationSingleUser();
    this.databaseCredentials.encryptionKey?.grantDecrypt(new ServicePrincipal('rds.amazonaws.com'));

    if (this.aurora.secret && this.aurora.clusterEndpoint) {
      new CfnOutput(this, 'SecretName', {
        exportName: 'SecretName',
        value: this.aurora.secret.secretName,
      });
      new CfnOutput(this, 'SecretArn', {
        exportName: 'SecretArn',
        value: this.aurora.secret.secretArn,
      });

      new CfnOutput(this, 'AuroraClusterIdentifier', {
        exportName: 'AuroraClusterIdentifier',
        value: this.aurora.clusterIdentifier,
      });

      new CfnOutput(this, 'AuroraEndpoint', {
        exportName: 'AuroraEndpoint',
        value: this.aurora.clusterEndpoint.hostname,
      });

      new CfnOutput(this, 'AuroraSecurityGroupId', {
        exportName: 'AuroraSecurityGroupId',
        value: this.aurora.connections.securityGroups[0].securityGroupId,
      });

      new CfnOutput(this, 'AuroraSecretEncryptionKeyArn', {
        exportName: 'AuroraSecretEncryptionKeyArn',
        value: this.aurora.secret.encryptionKey ? this.aurora.secret.encryptionKey.keyArn : '',
      });

      if (props.enabledProxy) {
        new CfnOutput(this, 'RDSProxyEndpoint', {
          exportName: 'RdsProxyEndpoint',
          value: this.proxy.endpoint,
        });
        new CfnOutput(this, 'RDSProxyArn', {
          exportName: 'RdsProxyArn',
          value: this.proxy.dbProxyArn,
        });
      }
    }
    NagSuppressions.addResourceSuppressions(
      this.aurora,
      [
        {
          id: 'AwsSolutions-RDS10',
          reason: 'for Development purpose only',
        },
      ],
      true
    );
  }
}
