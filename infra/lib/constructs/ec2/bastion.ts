import {
  CfnKeyPair,
  BlockDeviceVolume,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Port,
  SecurityGroup,
  SubnetType,
  WindowsVersion,
  IVpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class Bastion extends Construct {
  public readonly bastionInstance: Instance;
  constructor(
    scope: Construct,
    id: string,
    props: {
      os: 'Linux' | 'Windows';
      vpc: IVpc;
      region: string;
      auroraSecurityGroupId?: string;
      instanceType?: InstanceType;
    }
  ) {
    super(scope, id);

    // keypair
    const keyPair = new CfnKeyPair(this, `${id}InstanceKeypair`, {
      keyName: `${id}-instance-keypair`,
    });

    // Create EC2 instance to do testing for PrivateLink
    const instanceRole = new Role(this, `${id}instanceRole`, {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });

    // If this instance is Linux, If this instance is Linux, this instance is geven grant to access to S3 repo.
    if (props.os === 'Linux') {
      instanceRole.attachInlinePolicy(
        new Policy(this, 'AccessYumRepoPolicy', {
          statements: [
            new PolicyStatement({
              actions: ['s3:GetObject'],
              resources: [
                `arn:aws:s3:::amazonlinux.${Stack.of(this).region}.amazonaws.com/*`,
                `arn:aws:s3:::amazonlinux-2-repos-${Stack.of(this).region}/*`,
              ],
            }),
          ],
        })
      );
    }

    const bastionInstance = new Instance(this, `${id}BastionInstance`, {
      vpc: props.vpc,
      instanceType: props.instanceType
        ? props.instanceType
        : InstanceType.of(InstanceClass.T2, InstanceSize.SMALL), // default is t2-small
      machineImage:
        props.os === 'Linux'
          ? MachineImage.latestAmazonLinux()
          : MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2022_JAPANESE_FULL_BASE),
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      role: instanceRole,
      keyName: keyPair.keyName,
      blockDevices: [
        {
          deviceName: props.os === 'Linux' ? '/dev/xvda' : '/dev/sda1',
          volume: BlockDeviceVolume.ebs(30, {
            encrypted: true,
          }),
        },
      ],
      requireImdsv2: true,
    });
    this.bastionInstance = bastionInstance;

    // Allow access to RDS
    if (props.auroraSecurityGroupId) {
      bastionInstance.connections.allowTo(
        SecurityGroup.fromSecurityGroupId(this, 'AuroraSecurityGroup', props.auroraSecurityGroupId),
        Port.tcp(5432)
      );
    }

    new CfnOutput(this, `${id}BastionInstanceId`, {
      value: bastionInstance.instanceId,
      exportName: `${id}BastionInstanceId`,
    });

    // Command to get SSH Key
    new CfnOutput(this, `GetSSHKeyFor${id}InstanceCommand`, {
      value: `aws ssm get-parameter --name /ec2/keypair/${keyPair.getAtt('KeyPairId')} --region ${
        props.region
      } --with-decryption --query Parameter.Value --output text`,
    });

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(instanceRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'To use SSM for instance, this managed policy is required.',
      },
    ]);
    NagSuppressions.addResourceSuppressions(bastionInstance, [
      {
        id: 'AwsSolutions-EC29',
        reason:
          "This instance is to use for maintenance of this system. It's no problem if it was deleted.",
      },
      {
        id: 'AwsSolutions-EC28',
        reason:
          'This instance is to use for maintenance of this system. Detailed monitoring is not required.',
      },
    ]);
  }
}
