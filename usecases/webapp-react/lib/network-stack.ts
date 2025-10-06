import { StackProps, Stack, aws_ec2, aws_route53resolver, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { Network } from './construct/network/network';
import { ApplicationLoadBalancer } from './construct/network/alb';

interface NetworkStackProps extends StackProps {
  sharedVpcCidr: string;
  vpcCidr: string;
  privateLinkVpcCidr?: string;
  tgw: aws_ec2.CfnTransitGateway;
  resolverInboundEndpointIps: string[];
  certificateArn: string;
  domainName: string;
}

export class NetworkStack extends Stack {
  public readonly vpc: aws_ec2.Vpc;
  public readonly privateLinkVpc: aws_ec2.Vpc;
  public readonly sgIdForVpcEndpoint: string;
  public readonly spaS3InterfaceEndpoint: aws_ec2.InterfaceVpcEndpoint;
  public readonly sgForApiGwVpce: aws_ec2.SecurityGroup;
  public readonly privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
  public readonly alb: ApplicationLoadBalancer;
  public readonly sgForAlb: aws_ec2.SecurityGroup;
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

    this.spaS3InterfaceEndpoint = network.vpc.addInterfaceEndpoint('SpaS3InterfaceEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.S3,
      privateDnsEnabled: false,
    });

    // Security Group for ALB
    this.sgForAlb = new aws_ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: network.vpc,
      allowAllOutbound: true,
      description: 'Security group for Application Load Balancer',
    });
    this.spaS3InterfaceEndpoint.connections.allowFrom(this.sgForAlb, aws_ec2.Port.tcp(80));

    // Security Group for API Gateway VPC Endpoint
    this.sgForApiGwVpce = new aws_ec2.SecurityGroup(this, 'ApiGatewayVpceSecurityGroup', {
      vpc: network.vpc,
      allowAllOutbound: true,
    });
    
    // VPC endpoint for API Gateway
    this.privateApiVpcEndpoint = new aws_ec2.InterfaceVpcEndpoint(this, 'privateApiVpcEndpoint', {
      vpc: network.vpc,
      service: aws_ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
      privateDnsEnabled: true,
      subnets: { subnets: network.vpc.isolatedSubnets },
      securityGroups: [this.sgForApiGwVpce],
      open: false,
    });

    // Application Load Balancer
    this.alb = new ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc: network.vpc,
      sgForAlb: this.sgForAlb,
      certificateArn: props.certificateArn,
      domainName: props.domainName,
      spaS3InterfaceEndpoint: this.spaS3InterfaceEndpoint,
      privateApiVpcEndpoint: this.privateApiVpcEndpoint,
    });

    // Suppress cdk-nag warnings for CustomResource Lambda execution role
    // Using AWS managed policy to keep source code simple
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Using AWS managed policy to keep source code simple and maintainable',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
      },
    ]);

    new aws_ec2.CfnVPCDHCPOptionsAssociation(this, 'DHCPOptionsAssociation', {
      dhcpOptionsId: dhcpOptions.attrDhcpOptionsId,
      vpcId: this.vpc.vpcId
    })

    // Add route from this AppVPC to SharedVpc via TransitGatewayAttachement
    network.addRouteToTgwAttachementSubnets(props.tgw.attrId, props.sharedVpcCidr);
  }
}
