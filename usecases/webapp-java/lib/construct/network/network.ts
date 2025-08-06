import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import {
  FlowLogDestination,
  FlowLogTrafficType,
  SubnetType,
  Vpc,
  VpcProps,
  IpAddresses,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { EncryptionKey } from '../kms/key';
import { Construct } from 'constructs';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class Network extends Construct {
  public readonly vpc: Vpc;

  constructor(
    scope: Construct,
    id: string,
    props: {
      maxAzs: number;
      cidr: string;
      cidrMask: number;
      publicSubnet?: boolean;
      isolatedSubnet?: boolean;
      natSubnet?: boolean;
    }
  ) {
    super(scope, id);

    // Vpc logging - 60 days
    const cwLogs = new LogGroup(this, `${id}VpcLogs`, {
      logGroupName: `/vpc/${id}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.TWO_MONTHS,
      encryptionKey: new EncryptionKey(this, `${id}CWLogsEncryptionKey`, {
        servicePrincipals: [new ServicePrincipal('logs.amazonaws.com')],
      }).encryptionKey,
    });

    const subnetConfiguration: VpcProps['subnetConfiguration'] = [];

    if (props.publicSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: `${id.toLowerCase()}-public-subnet`,
        subnetType: SubnetType.PUBLIC,
      });
    }

    if (props.natSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: `${id.toLowerCase()}-private-subnet`,
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      });
    }

    if (props.isolatedSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: `${id.toLowerCase()}-isolated-subnet`,
        subnetType: SubnetType.PRIVATE_ISOLATED,
      });
    }

    if (subnetConfiguration.length < 1 || !subnetConfiguration) {
      throw new Error('No subnet configuration enabled');
    }

    // Create VPC - Private and public subnets
    this.vpc = new Vpc(this, `Vpc`, {
      ipAddresses: IpAddresses.cidr(props.cidr),
      subnetConfiguration,
      maxAzs: props.maxAzs,
      flowLogs: {
        s3: {
          destination: FlowLogDestination.toCloudWatchLogs(cwLogs),
          trafficType: FlowLogTrafficType.ALL,
        },
      },
    });

    new CfnOutput(this, 'VpcId', {
      exportName: `${id}VpcId`,
      value: this.vpc.vpcId,
    });
  }
}
