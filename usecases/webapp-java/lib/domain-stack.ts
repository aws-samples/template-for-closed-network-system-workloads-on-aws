import { StackProps, Stack, aws_ec2, aws_route53_targets, aws_route53 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './construct/network/network';

interface RecordItem {
  name: string;
  target: aws_route53.RecordTarget;
}

interface DomainStackProps extends StackProps {
  sharedVpc: aws_ec2.Vpc;
  tgw: aws_ec2.CfnTransitGateway;
  domainName: string;
  recordItems: RecordItem[];
  resolverInboundEndpointIps: string[];
}

export class DomainStack extends Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
  super(scope, id, props);

    
    // Create Private Hosted Zone
    const privateHostedZone = new aws_route53.PrivateHostedZone(this, 'PrivateHostedZone', {
      zoneName: props.domainName,
      vpc: props.sharedVpc,
    });

    // Add A records
    props.recordItems.map(recordItem => {
      new aws_route53.ARecord(this, 'AlbARecord', {
        recordName: recordItem.name,
        target: recordItem.target,
        zone: privateHostedZone,
      });
    })
  }
}