import { StackProps, Stack, aws_codecommit, aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './construct/network/network';

export class NetworkStack extends Stack {
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
  }
}
