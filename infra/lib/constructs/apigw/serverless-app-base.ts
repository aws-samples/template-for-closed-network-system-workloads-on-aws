import {
  aws_ec2,
  aws_elasticloadbalancingv2,
  aws_elasticloadbalancingv2_targets,
  aws_iam,
  aws_route53,
  aws_route53_targets,
  CfnOutput,
  Stack,
  custom_resources,
  aws_s3,
  aws_apigateway,
  aws_certificatemanager,
} from 'aws-cdk-lib';
import { Bucket } from '../s3/bucket';
import { Construct } from 'constructs';
import { WebAppBucket } from '../s3/webappbucket';
import { Apigw } from './apigw';

export class ServerlessAppBase extends Construct {
  public readonly targetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly vpcEndpointTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly apigwTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly httpsTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly nlb: aws_elasticloadbalancingv2.NetworkLoadBalancer;
  public readonly webapps3bucket: aws_s3.Bucket;
  public readonly lambdaFunctionRole : aws_iam.Role;
  public readonly sgForLambda:aws_ec2.SecurityGroup;
  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      privateLinkVpc?: aws_ec2.IVpc;
      domainName: string;
      certificateArn: string;
      auroraSecretName: string;
      auroraSecretArn: string;
      auroraSecurityGroupId: string;
      auroraSecretEncryptionKeyArn: string;
      auroraEdition:string;
      rdsProxyEndpoint:string;
      rdsProxyArn:string;
    }
  ) {
    super(scope, id);
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
      loadBalancerName: "alb",
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      }),
      dropInvalidHeaderFields: true,
    });
    const albLogBucket = new Bucket(this, 'AlbLogBucket');

    this.alb.logAccessLogs(albLogBucket.bucket, `${id}WebappAlbLog`);

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

    const s3InterfaceEndpoint = props.vpc.addInterfaceEndpoint('S3InterfaceEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.S3,
      subnets: { subnets: props.vpc.isolatedSubnets},
      privateDnsEnabled: true,
    });

    
     // use CDK custom resources to get the Network Interfaces and IP addresses of the API Endpoint
    // get IP Address from S3 VPC Endpoint
    // See here : https://repost.aws/ja/questions/QUjISNyk6aTA6jZgZQwKWf4Q/how-to-connect-a-load-balancer-and-an-interface-vpc-endpoint-together-using-cdk?sc_ichannel=ha&sc_ilang=en&sc_isite=repost&sc_iplace=hp&sc_icontent=QUjISNyk6aTA6jZgZQwKWf4Q&sc_ipos=7
    const eni = new custom_resources.AwsCustomResource(
      this,
      "DescribeNetworkInterfaces",
      {
        onCreate: {
          service: "EC2",
          action: "describeNetworkInterfaces",
          parameters: {
            NetworkInterfaceIds: s3InterfaceEndpoint.vpcEndpointNetworkInterfaceIds,
          },
          physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
        },
        onUpdate: {
          service: "EC2",
          action: "describeNetworkInterfaces",
          parameters: {
            NetworkInterfaceIds: s3InterfaceEndpoint.vpcEndpointNetworkInterfaceIds,
          },
          physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
        },
        policy: {
          statements: [
            new aws_iam.PolicyStatement({
              actions: ["ec2:DescribeNetworkInterfaces"],
              resources: ["*"],
            }),
          ],
        },
      }
    );

    // Import Web App S3
    const s3buckets = new WebAppBucket(this, 'WebappBucket',{bucketname:`app.${props.domainName}`});
    this.webapps3bucket=s3buckets.webAppBucket
    // create ALB Target Group (for s3)
    this.vpcEndpointTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, "VpcEndpointTargetGroup", {
      vpc: props.vpc,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      port: 443,
      protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      healthCheck: {
        healthyHttpCodes: "307,405",
      },
    });
    // get isolated subnets num
    const numofip = props.vpc.isolatedSubnets.length;
    for (let i =0;i<numofip;i++ ) {
      this.vpcEndpointTargetGroup.addTarget(new aws_elasticloadbalancingv2_targets.IpTarget(eni.getResponseField(`NetworkInterfaces.${i}.PrivateIpAddress`)));
    }
    httpsListener.addTargetGroups('VPCEndpointTargetGroup', {
      targetGroups: [this.vpcEndpointTargetGroup],
    });
    s3buckets.webAppBucket.addToResourcePolicy(new aws_iam.PolicyStatement({
      actions:["s3:GetObject"],
      principals: [new aws_iam.ArnPrincipal('*')],
      effect:aws_iam.Effect.ALLOW,
      resources:[
        s3buckets.webAppBucket.bucketArn,
        s3buckets.webAppBucket.bucketArn+"/*",
      ],
      conditions: {
        "StringEquals": {
          "aws:SourceVpce": [ s3InterfaceEndpoint.vpcEndpointId ]
        }
      }
      })
    )
    // APIGW
    const apigw = new Apigw(this, `WebappAPIGW`, {
      vpc:props.vpc,
      auroraSecretName: props.auroraSecretName,
      auroraSecurityGroupId: props.auroraSecurityGroupId,
      auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
      auroraEdition:props.auroraEdition,
      auroraSecretArn: props.auroraSecretArn,
      rdsProxyEndpoint:props.rdsProxyEndpoint,
      rdsProxyArn:props.rdsProxyArn
    });
    this.lambdaFunctionRole=apigw.lambdaFunctionRole;
    this.sgForLambda=apigw.sgForLambda;
    // allow alb to apigw
    apigw.vpcEndpointSecurityGroup.addIngressRule(sgForAlb,aws_ec2.Port.tcp(443));
    // use CDK custom resources to get the Network Interfaces and IP addresses of the API Endpoint
    // get IP Address from APIGW VPC Endpoint
    // See here : https://repost.aws/ja/questions/QUjISNyk6aTA6jZgZQwKWf4Q/how-to-connect-a-load-balancer-and-an-interface-vpc-endpoint-together-using-cdk?sc_ichannel=ha&sc_ilang=en&sc_isite=repost&sc_iplace=hp&sc_icontent=QUjISNyk6aTA6jZgZQwKWf4Q&sc_ipos=7
    const apigweni = new custom_resources.AwsCustomResource(
      this,
      "DescribeNetworkInterfacesAPIGW",
      {
        onCreate: {
          service: "EC2",
          action: "describeNetworkInterfaces",
          parameters: {
            NetworkInterfaceIds: apigw.privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
          },
          physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
        },
        onUpdate: {
          service: "EC2",
          action: "describeNetworkInterfaces",
          parameters: {
            NetworkInterfaceIds: apigw.privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
          },
          physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
        },
        policy: {
          statements: [
            new aws_iam.PolicyStatement({
              actions: ["ec2:DescribeNetworkInterfaces"],
              resources: ["*"],
            }),
          ],
        },
      }
    );
    // create ALB Target Group (for apigw)
    this.apigwTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, "ApigwTarget", {
      vpc: props.vpc,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      port: 443,
      protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      healthCheck: {
        healthyHttpCodes: '200-202,400-404',
      },
    });
    for (let i =0;i<numofip;i++ ) {
      this.apigwTargetGroup.addTarget(new aws_elasticloadbalancingv2_targets.IpTarget(apigweni.getResponseField(`NetworkInterfaces.${i}.PrivateIpAddress`)));
    }

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

      // Create the API domain
      const apiDomain = new aws_apigateway.DomainName(this, 'apiDomain', {
        domainName:  `app.${props.domainName}`,
        certificate:aws_certificatemanager.Certificate.fromCertificateArn(this,"certificate",props.certificateArn),
        endpointType: aws_apigateway.EndpointType.REGIONAL, // API domains can only be created for Regional endpoints, but it will work with the Private endpoint anyway
        securityPolicy:  aws_apigateway.SecurityPolicy.TLS_1_2,
    });
      new aws_apigateway.BasePathMapping(this, 'apigwPathMapping', {
        basePath: "apigw",
        domainName: apiDomain,
        restApi: apigw.privateApi,
    });
    httpsListener.addAction('apis', {
      action: aws_elasticloadbalancingv2.ListenerAction.forward([this.apigwTargetGroup]),
      conditions: [
        aws_elasticloadbalancingv2.ListenerCondition.pathPatterns([`/apigw/*`]),
      ],
      priority: 1,
    });
    httpsListener.addAction('Fixed', {
      priority: 5,
      conditions: [
        aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(["/"]),
      ],
      action: aws_elasticloadbalancingv2.ListenerAction.redirect({
        protocol: aws_elasticloadbalancingv2.Protocol.HTTPS,
        host: "#{host}",
        path: "/index.html",
        query: "#{query}"
      })
    });
    }
  }
}
