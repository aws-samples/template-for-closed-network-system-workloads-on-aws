import { StackProps, Stack, aws_ec2, aws_ram, aws_route53resolver, CfnOutput, aws_ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './construct/network/network';
import { Bastion } from './construct/ec2/bastion';

interface SharedNetworkStackProps extends StackProps {
  sharedVpcCidr: string;
  destinationVpcCidrs: string[];
  destinationAccounts?: string[];
  windowsBastion: boolean;
  linuxBastion: boolean;
}

export class SharedNetworkStack extends Stack {
  public readonly network: Network; 
  public readonly tgw: aws_ec2.CfnTransitGateway;
  public readonly resolverInboundEndpoint: aws_route53resolver.CfnResolverEndpoint;
  public readonly endpointIps: string[];
  public readonly appRunnerVpcEndpointId: string;

  constructor(scope: Construct, id: string, props: SharedNetworkStackProps) {
    super(scope, id, props);

    const tgw = new aws_ec2.CfnTransitGateway(this, 'Tgw',{
      autoAcceptSharedAttachments: "enable",
      defaultRouteTableAssociation: "enable",
      defaultRouteTablePropagation: "enable",
      dnsSupport: "enable",
    });

    // Create networking resources
    const network = new Network(this, `SharedVpc`, {
      cidr: props.sharedVpcCidr,
      maxAzs: 2,
      tgw,
    });

    // Security Group for InboundEndpoint and VPC Endpoints
    const inboundEndpointSG = new aws_ec2.SecurityGroup(this, 'InboundEndpointSG', {
      vpc: network.vpc,
      allowAllOutbound: true,
    });
    const vpcEndpointSG = new aws_ec2.SecurityGroup(this, 'VpcEndpointSG', {
      vpc: network.vpc,
      allowAllOutbound: true,
    });
    [props.sharedVpcCidr, ...props.destinationVpcCidrs].map(cidr => {
      inboundEndpointSG.addIngressRule(aws_ec2.Peer.ipv4(cidr), aws_ec2.Port.DNS_TCP);
      inboundEndpointSG.addIngressRule(aws_ec2.Peer.ipv4(cidr), aws_ec2.Port.DNS_UDP);
      vpcEndpointSG.addIngressRule(aws_ec2.Peer.ipv4(cidr), aws_ec2.Port.HTTPS);
    })

    // VPC Endpoint - for ECS
    network.vpc.addInterfaceEndpoint('EcrEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });
    
    network.vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });
    
    network.vpc.addInterfaceEndpoint('LogVpcEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });
    
    network.vpc.addInterfaceEndpoint('S3Endpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.S3,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });

    // VPC Endpoint - for ECS/Aurora
    network.vpc.addInterfaceEndpoint('SecretsmanagerEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });
    
    // VPC Endpoint - for Bastion
    network.vpc.addInterfaceEndpoint('BastionSsmVpcEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });
    
    network.vpc.addInterfaceEndpoint('BastionSsmMessagesVpcEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });
    
    network.vpc.addInterfaceEndpoint('BastionEc2MessagesVpcEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    });

    network.vpc.addGatewayEndpoint('BastionS3GatewayEndpoint', {
      service: aws_ec2.GatewayVpcEndpointAwsService.S3,
    })

    network.vpc.addInterfaceEndpoint('S3InterfaceEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.S3,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: true,
      securityGroups:[vpcEndpointSG]
    })

    // VPC Endpoint - for Instance Manager app
    const appRunnerVpcEndpoint = network.vpc.addInterfaceEndpoint('AppRunnerVpcEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.APP_RUNNER_REQUESTS,
      subnets: { subnetFilters: [aws_ec2.SubnetFilter.byIds(network.workloadSubnets.map(subnet => subnet.subnetId))] },
      privateDnsEnabled: false, // AppRunnerRequests could not provide private dns
      securityGroups:[vpcEndpointSG]
    })
    this.appRunnerVpcEndpointId = appRunnerVpcEndpoint.vpcEndpointId;

    // Add routes via TGW
    props.destinationVpcCidrs.map(vpcCidr => {
      network.addRouteToTgwAttachementSubnets(tgw.attrId, vpcCidr);
    })

    // Add TGW to Resource Access Manager
    if(props.destinationAccounts && props.destinationAccounts.length > 0) {
      new aws_ram.CfnResourceShare(this, 'TgwResourceShare',{
        name: "TgwShare",
        allowExternalPrincipals: true,
        principals: props.destinationAccounts,
        resourceArns: [tgw.attrTransitGatewayArn],
      });
    }

    // Resolver inbound endpoint
    this.endpointIps = [];
    this.resolverInboundEndpoint = new aws_route53resolver.CfnResolverEndpoint(this, 'ResolverInboundEndpoint', {
      direction: 'INBOUND',
      ipAddresses: [...network.workloadSubnets.map(subnet => {
        const ip = `${subnet.ipv4CidrBlock.split('/')[0].split('.').slice(0, 3).join('.')}.5`;
        this.endpointIps.push(ip)
        return {
          subnetId: subnet.subnetId,
          ip
        }
      })],
      securityGroupIds: [inboundEndpointSG.securityGroupId],
    });
    
    this.tgw = tgw;
    this.network = network;
    
    // Bastion
    if (props.windowsBastion) {
      const bastion = new Bastion(this, `Windows`, {
        os: 'Windows',
        vpc: this.network.vpc,
      });
      
      // WindowsバスティオンのIPをSSMパラメータに保存
      new aws_ssm.StringParameter(this, 'WindowsBastionIpParameter', {
        parameterName: `/${id}/WindowsBastionIp`,
        stringValue: bastion.bastionInstance.instance.attrPrivateIp,
        description: 'Windows Bastion Instance Private IP',
      });
    }

    if (props.linuxBastion) {
      const bastion = new Bastion(this, `Linux`, {
        os: 'Linux',
        vpc: this.network.vpc,
      });
      
      // LinuxバスティオンのIPをSSMパラメータに保存
      new aws_ssm.StringParameter(this, 'LinuxBastionIpParameter', {
        parameterName: `/${id}/LinuxBastionIp`,
        stringValue: bastion.bastionInstance.instance.attrPrivateIp,
        description: 'Linux Bastion Instance Private IP',
      });
    }
  }
}
