import {
  aws_ec2,
  aws_ecs,
  aws_elasticloadbalancingv2,
  CfnOutput,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Bucket } from '../s3/bucket';
import { Construct } from 'constructs';

export class EcsAppBase extends Construct {
  public readonly cluster: aws_ecs.Cluster;
  public readonly targetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly httpsTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly albSg: aws_ec2.SecurityGroup;
  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      domainName: string;
      certificateArn: string;
    }
  ) {
    super(scope, id);

    // ECS Cluster
    this.cluster = new aws_ecs.Cluster(this, 'Cluster', {
      clusterName: `${id.split('-').slice(-1)[0]}Cluster`,
      vpc: props.vpc,
      containerInsightsV2: aws_ecs.ContainerInsights.ENABLED,
      enableFargateCapacityProviders: true,
    });
    this.cluster.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Security Group for ALB
    const albSg = new aws_ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    this.albSg = albSg;

    // ALB
    this.alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: false,
      securityGroup: albSg,
      vpcSubnets: props.vpc.selectSubnets({
        subnets: [...props.vpc.isolatedSubnets.filter(subnet => subnet.node.id.includes('workload'))],
      }),
      dropInvalidHeaderFields: true,
    });
    const albLogBucket = new Bucket(this, 'AlbLogBucket', {versioned: false});

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

    new CfnOutput(this, 'ClusterName', {
      exportName: `${id}ClusterName`,
      value: this.cluster.clusterName,
    });
  }
}
