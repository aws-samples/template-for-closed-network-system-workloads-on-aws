import { StackProps, Stack, aws_ec2, aws_route53resolver, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './construct/network/network';

interface NetworkStackProps extends StackProps {
  sharedVpcCidr: string;
  vpcCidr: string;
  privateLinkVpcCidr?: string;
  tgw: aws_ec2.CfnTransitGateway;
  resolverInboundEndpointIps: string[];
}

export class NetworkStack extends Stack {
  public readonly vpc: aws_ec2.Vpc;
  public readonly privateLinkVpc: aws_ec2.Vpc;
  public readonly sgIdForVpcEndpoint: string;
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // Create networking resources
    const network = new Network(this, `Vpc`, {
      cidr: props.vpcCidr,
      maxAzs: 2,
      tgw: props.tgw
    });
    this.vpc = network.vpc;

    const dhcpOptions = new aws_ec2.CfnDHCPOptions(this, 'DHCPOptions', {
      domainName: `${Stack.of(this).region}.compute.internal`,
      domainNameServers: props.resolverInboundEndpointIps 
    });

    // Gateway Endpoint is required in each VPCs.
    network.vpc.addGatewayEndpoint('BastionS3GatewayEndpoint', {
      service: aws_ec2.GatewayVpcEndpointAwsService.S3,
    });

    new aws_ec2.CfnVPCDHCPOptionsAssociation(this, 'DHCPOptionsAssociation', {
      dhcpOptionsId: dhcpOptions.attrDhcpOptionsId,
      vpcId: this.vpc.vpcId
    })

    // Add route from this AppVPC to SharedVpc via TransitGatewayAttachement
    network.addRouteToTgwAttachementSubnets(props.tgw.attrId, props.sharedVpcCidr);
  }
}
