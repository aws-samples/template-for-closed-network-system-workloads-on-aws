import {
  aws_elasticloadbalancingv2,
  aws_elasticloadbalancingv2_targets,
  aws_ec2,
  aws_certificatemanager,
  aws_iam,
  Fn,
  custom_resources,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { Bucket } from '../s3/bucket';

export class ApplicationLoadBalancer extends Construct {
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly httpsListener: aws_elasticloadbalancingv2.ApplicationListener;
  public readonly apiGwTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly s3TargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;

  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      sgForAlb: aws_ec2.SecurityGroup;
      certificateArn: string;
      domainName: string;
      spaS3InterfaceEndpoint: aws_ec2.InterfaceVpcEndpoint;
      privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
    }
  ) {
    super(scope, id);

    // ALB Log Bucket
    const albLogBucket = new Bucket(this, 'AlbLogBucket', { versioned: false });

    // Application Load Balancer
    this.alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: false,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      }),
      dropInvalidHeaderFields: true,
      securityGroup: props.sgForAlb,
    });

    // ALB Access Logs
    this.alb.logAccessLogs(albLogBucket.bucket, `${id}WebappAlbLog`);

    // HTTPS Listener
    this.httpsListener = this.alb.addListener('WebappHttpsListener', {
      port: 443,
      protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      open: false,
      sslPolicy: aws_elasticloadbalancingv2.SslPolicy.TLS12,
    });

    // Add Certificate
    this.httpsListener.addCertificates(`${id}Certificate`, [
      aws_elasticloadbalancingv2.ListenerCertificate.fromArn(props.certificateArn),
    ]);

    // Target Group for API Gateway
    this.apiGwTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(
      this,
      'ApiGwTargetGroup',
      {
        vpc: props.vpc,
        targetType: aws_elasticloadbalancingv2.TargetType.IP,
        port: 443,
        protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
        healthCheck: {
          healthyHttpCodes: '200,403',
        },
      }
    );

    // Target Group for S3 (VPC Endpoint)
    this.s3TargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(
      this,
      'S3TargetGroup',
      {
        vpc: props.vpc,
        targetType: aws_elasticloadbalancingv2.TargetType.IP,
        port: 443,
        protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
        healthCheck: {
          healthyHttpCodes: '307,405',
        },
      }
    );

    // Get ENI IPs for S3 VPC Endpoint
    const s3NiIds = props.vpc.availabilityZones.map((az, index) => 
      Fn.select(index, props.spaS3InterfaceEndpoint.vpcEndpointNetworkInterfaceIds)
    );

    const s3Eni = new custom_resources.AwsCustomResource(this, 'DescribeS3NetworkInterfaces', {
      onCreate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: s3NiIds,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
      },
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: s3NiIds,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
      },
      policy: {
        statements: [
          new aws_iam.PolicyStatement({
            actions: ['ec2:DescribeNetworkInterfaces'],
            resources: ['*'],
          }),
        ],
      },
    });

    // Get ENI IPs for API Gateway VPC Endpoint
    const apiGwEni = new custom_resources.AwsCustomResource(this, 'DescribeApiGwNetworkInterfaces', {
      onCreate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: props.privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
      },
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: props.privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
      },
      policy: {
        statements: [
          new aws_iam.PolicyStatement({
            actions: ['ec2:DescribeNetworkInterfaces'],
            resources: ['*'],
          }),
        ],
      },
    });

    // Add IP targets to Target Groups
    const numOfIp = props.vpc.selectSubnets({
      subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
    }).subnets.length;

    for (let i = 0; i < numOfIp; i++) {
      // Add S3 VPC Endpoint IPs to S3 Target Group
      this.s3TargetGroup.addTarget(
        new aws_elasticloadbalancingv2_targets.IpTarget(
          s3Eni.getResponseField(`NetworkInterfaces.${i}.PrivateIpAddress`)
        )
      );

      // Add API Gateway VPC Endpoint IPs to API Gateway Target Group
      this.apiGwTargetGroup.addTarget(
        new aws_elasticloadbalancingv2_targets.IpTarget(
          apiGwEni.getResponseField(`NetworkInterfaces.${i}.PrivateIpAddress`)
        )
      );
    }

    // Add Listener Actions
    this.httpsListener.addTargetGroups('VPCEndpointTargetGroup', {
      targetGroups: [this.s3TargetGroup],
    });

    this.httpsListener.addAction('apis', {
      action: aws_elasticloadbalancingv2.ListenerAction.forward([this.apiGwTargetGroup]),
      conditions: [aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(['/apigw/*'])],
      priority: 1,
    });
    this.httpsListener.addAction('redirect', {
      priority: 5,
      conditions: [aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(['/'])],
      action: aws_elasticloadbalancingv2.ListenerAction.redirect({
        protocol: aws_elasticloadbalancingv2.Protocol.HTTPS,
        host: '#{host}',
        path: '/index.html',
        query: '#{query}',
      }),
    });

    // Suppress cdk-nag warnings for CustomResource policies
    // CustomResource policies are automatically generated by AWS and require wildcard permissions
    NagSuppressions.addResourceSuppressions(
      s3Eni,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CustomResource policies are automatically generated by AWS and wildcard permissions are unavoidable',
          appliesTo: ['Resource::*'],
        },
      ],
      true
    );

    NagSuppressions.addResourceSuppressions(
      apiGwEni,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CustomResource policies are automatically generated by AWS and wildcard permissions are unavoidable',
          appliesTo: ['Resource::*'],
        },
      ],
      true
    );
  }

}
