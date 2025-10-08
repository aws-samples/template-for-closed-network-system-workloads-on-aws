import {
  BlockDeviceVolume,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  KeyPair,
  MachineImage,
  WindowsVersion,
  IVpc,
  SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import {
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { CfnOutput, Stack, Tags } from 'aws-cdk-lib';
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
      instanceType?: InstanceType;
      securityGroup?: SecurityGroup; // セキュリティグループを受け取るオプションを追加
    }
  ) {
    super(scope, id);

    // keypair
    const keyPair = new KeyPair(this, `${id}InstanceKeypair`);

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
              resources: [`arn:aws:s3:::al2023-repos-${Stack.of(this).region}-de612dc2/*`],
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
          ? MachineImage.latestAmazonLinux2023()
          : MachineImage.latestWindows(WindowsVersion.WINDOWS_SERVER_2022_JAPANESE_FULL_BASE),
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets.filter(subnet => subnet.node.id.includes("workload")),
      },
      role: instanceRole,
      keyPair: keyPair,
      securityGroup: props.securityGroup, // 渡されたセキュリティグループを使用
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
    Tags.of(this.bastionInstance).add('GroupId', 'admin');


    new CfnOutput(this, `${id}BastionInstanceId`, {
      value: bastionInstance.instanceId,
      exportName: `${id}BastionInstanceId`,
    });

    // Command to get SSH Key
    new CfnOutput(this, `GetSSHKeyFor${id}InstanceCommand`, {
      value: `aws ssm get-parameter --name /ec2/keypair/${keyPair.keyPairId} --region ${
        Stack.of(this).region
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
