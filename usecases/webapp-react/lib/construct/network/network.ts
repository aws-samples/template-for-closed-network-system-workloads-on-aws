import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import {
  CfnRoute,
  FlowLogDestination,
  FlowLogTrafficType,
  ISubnet,
  SubnetType,
  Vpc,
  IpAddresses,
  CfnTransitGateway,
  CfnTransitGatewayAttachment,
  CfnRouteTable,
  PrivateSubnet,
  CfnSubnetRouteTableAssociation,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { EncryptionKey } from '../kms/key';
import { Construct } from 'constructs';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class Network extends Construct {
  public readonly vpc: Vpc;
  public readonly routeTable: CfnRouteTable;
  public readonly tgwAttachment: CfnTransitGatewayAttachment;
  public readonly tgwAttachmentSubnets: ISubnet[];
  public readonly workloadSubnets: ISubnet[];

  constructor(
    scope: Construct,
    id: string,
    props: {
      maxAzs: number;
      cidr: string;
      tgw: CfnTransitGateway;
    }
  ) {
    super(scope, id);
    const cidrMask = 24;

    // Validation CIDR
    const cidrParts = props.cidr.split('/');
    const cidrPrefix = parseInt(cidrParts[1], 10);
    if (cidrPrefix !== 16) {
      throw new Error(`CIDR prefix must be  /16, got /${cidrPrefix}`);
    }

    // Vpc logging - 60 days
    const cwLogs = new LogGroup(this, `${id}VpcLogs`, {
      logGroupName: `/vpc/${id}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.TWO_MONTHS,
      encryptionKey: new EncryptionKey(this, `${id}CWLogsEncryptionKey`, {
        servicePrincipals: [new ServicePrincipal('logs.amazonaws.com')],
      }).encryptionKey,
    });

    // Create VPC with Private subnets for workloads
    this.vpc = new Vpc(this, `Vpc`, {
      ipAddresses: IpAddresses.cidr(props.cidr),
      subnetConfiguration: [{
        cidrMask,
        name: `${id.toLowerCase()}-workload-subnet`,
        subnetType: SubnetType.PRIVATE_ISOLATED,
      }],
      maxAzs: props.maxAzs,
      flowLogs: {
        s3: {
          destination: FlowLogDestination.toCloudWatchLogs(cwLogs),
          trafficType: FlowLogTrafficType.ALL,
        },
      },
    });

    // Create route table for tgw subnets
    this.routeTable = new CfnRouteTable(this, 'RouteTable', {
      vpcId: this.vpc.vpcId,
    });

    this.workloadSubnets = this.vpc.isolatedSubnets.filter(subnet => 
      subnet.node.id.includes('workload')
    );

    this.tgwAttachmentSubnets = [];
    for (let i = 0; i < props.maxAzs; i++) {
      const subnet = new PrivateSubnet(this, `TgwSubnet${i}`, {
        vpcId: this.vpc.vpcId,
        availabilityZone: this.vpc.availabilityZones[i],
        cidrBlock: `${props.cidr.split('/')[0].split('.').slice(0, 2).join('.')}.${255 - i}.0/28`,
        mapPublicIpOnLaunch: false
      });
      
      // Associate same route table to tgw subnets
      new CfnSubnetRouteTableAssociation(this, `TgwSubnetRouteTableAssoc${i}`, {
        routeTableId: this.routeTable.ref,
        subnetId: subnet.subnetId
      });
      
      this.tgwAttachmentSubnets.push(subnet);
    }

    this.tgwAttachment = new CfnTransitGatewayAttachment(this, 'TgwAttachement', {
      transitGatewayId: props.tgw.attrId,
      vpcId: this.vpc.vpcId,
      subnetIds: this.tgwAttachmentSubnets.map(subnet => subnet.subnetId)
    });

    new CfnOutput(this, 'VpcId', {
      exportName: `${id}VpcId`,
      value: this.vpc.vpcId,
    });
  }

  public addRouteToTgwAttachementSubnets(tgwId: string, destVpcCidrBlock: string){
    const route = new CfnRoute(this, `TgwSubnetsRouteTo${destVpcCidrBlock}`,{
      routeTableId: this.routeTable.ref,
      destinationCidrBlock: destVpcCidrBlock,
      transitGatewayId: tgwId
    });
    route.addDependency(this.tgwAttachment);

    const workloadSubnetRoutes = this.workloadSubnets.map((subnet, index) => 
      new CfnRoute(this, `WorkloadSubnet${index}RouteTo${destVpcCidrBlock}`,{
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: destVpcCidrBlock,
        transitGatewayId: tgwId
      })
    );
    workloadSubnetRoutes.map(route => route.addDependency(this.tgwAttachment));
  }

}
