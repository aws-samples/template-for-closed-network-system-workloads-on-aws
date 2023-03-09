import {
  aws_ec2,
  aws_ecs,
  aws_elasticloadbalancingv2,
  aws_elasticloadbalancingv2_targets,
  aws_iam,
  aws_route53,
  aws_route53_targets,
  CfnOutput,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { Bucket } from '../s3/bucket';
import { Construct } from 'constructs';

export class EcsAppBase extends Construct {
  public readonly cluster: aws_ecs.Cluster;
  public readonly targetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly httpsTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly nlb: aws_elasticloadbalancingv2.NetworkLoadBalancer;
  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      privateLinkVpc?: aws_ec2.IVpc;
      domainName: string;
      certificateArn: string;
    }
  ) {
    super(scope, id);

    // VPC Endpoint
    props.vpc.addInterfaceEndpoint('EcrEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
    });

    props.vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
    });

    props.vpc.addInterfaceEndpoint('LogVpcEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
    });

    props.vpc.addGatewayEndpoint('S3Endpoint', {
      service: aws_ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnets: props.vpc.isolatedSubnets,
        },
      ],
    });

    // ECS Cluster
    this.cluster = new aws_ecs.Cluster(this, 'Cluster', {
      clusterName: `${id.split('-').slice(-1)[0]}Cluster`,
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });
    this.cluster.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Security Group for ALB
    const sgForAlb = new aws_ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    // ALB
    this.alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: false,
      securityGroup: sgForAlb,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      }),
      dropInvalidHeaderFields: true,
    });
    const albLogBucket = new Bucket(this, 'AlbLogBucket');

    this.alb.logAccessLogs(albLogBucket.bucket, `${id}WebappAlbLog`);

    this.cluster.connections.allowFrom(this.alb, aws_ec2.Port.tcp(80));

    const httpsListener = this.alb.addListener('WebappHttpsListener', {
      port: 443,
      protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      open: false,
      sslPolicy: aws_elasticloadbalancingv2.SslPolicy.TLS12,
    });
    httpsListener.addCertificates(`${id}Certificate`, [
      aws_elasticloadbalancingv2.ListenerCertificate.fromArn(props.certificateArn),
    ]);

    this.httpsTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(
      this,
      'HttpsTarget',
      {
        targetType: aws_elasticloadbalancingv2.TargetType.IP,
        port: 8080,
        vpc: props.vpc,
        healthCheck: { path: '/', port: '8080' },
      }
    );
    httpsListener.addTargetGroups('HttpsTargetGroup', {
      targetGroups: [this.httpsTargetGroup],
    });

    // Enable PrivateLink
    let nlbAccessLogBucket;
    if (props.privateLinkVpc) {
      this.nlb = new aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'Nlb', {
        vpc: props.vpc,
        internetFacing: false,
        crossZoneEnabled: true,
        vpcSubnets: props.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      });

      nlbAccessLogBucket = new Bucket(this, 'NlbAccessLogBucket');
      this.nlb.logAccessLogs(nlbAccessLogBucket.bucket);

      const httpsTargetGroup = this.nlb
        .addListener('NlbHttpsListener', {
          port: 443,
        })
        .addTargets('NlbHttpsTargets', {
          targets: [new aws_elasticloadbalancingv2_targets.AlbTarget(this.alb, 443)],
          port: 443,
        });

      httpsTargetGroup.configureHealthCheck({
        port: '443',
        protocol: aws_elasticloadbalancingv2.Protocol.HTTPS,
      });
      httpsTargetGroup.node.addDependency(httpsListener);

      const endpointService = new aws_ec2.VpcEndpointService(this, 'PrivateLinkEndpointService', {
        vpcEndpointServiceLoadBalancers: [this.nlb],
        acceptanceRequired: false,
        allowedPrincipals: [
          new aws_iam.ArnPrincipal(`arn:aws:iam::${Stack.of(this).account}:root`),
        ],
      });

      this.alb.connections.allowFrom(
        aws_ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
        aws_ec2.Port.tcp(443),
        'from same vpc like nlb'
      );

      // Create VPC endpoint
      const sgForVpcEndpoint = new aws_ec2.SecurityGroup(this, 'VpcEndpointSecurityGroupsg', {
        vpc: props.privateLinkVpc,
      });

      // For Private Link
      const privateLink = props.privateLinkVpc.addInterfaceEndpoint('TestVpcEndpoint', {
        service: new aws_ec2.InterfaceVpcEndpointService(endpointService.vpcEndpointServiceName),
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [sgForVpcEndpoint],
      });

      // Create Private Hosted Zone for private link domain name
      const privateHostedZone = new aws_route53.PrivateHostedZone(this, 'PrivateHostedZone', {
        zoneName: props.domainName,
        vpc: props.privateLinkVpc,
      });

      new aws_route53.ARecord(this, 'AlbARecord', {
        recordName: `app.${props.domainName}`,
        target: aws_route53.RecordTarget.fromAlias(
          new aws_route53_targets.InterfaceVpcEndpointTarget(privateLink)
        ),
        zone: privateHostedZone,
      });

      new CfnOutput(this, 'EndpointService', {
        exportName: `${id}EndpointService`,
        value: endpointService.vpcEndpointServiceName,
      });
    } else {
      // Create Private Hosted Zone for ALB internal domain name
      const privateHostedZone = new aws_route53.PrivateHostedZone(this, 'PrivateHostedZone', {
        zoneName: props.domainName,
        vpc: props.vpc,
      });

      new aws_route53.ARecord(this, 'AlbARecord', {
        recordName: `app.${props.domainName}`,
        target: aws_route53.RecordTarget.fromAlias(
          new aws_route53_targets.LoadBalancerTarget(this.alb)
        ),
        zone: privateHostedZone,
      });
    }

    new CfnOutput(this, 'ClusterName', {
      exportName: `${id}ClusterName`,
      value: this.cluster.clusterName,
    });
  }
}
