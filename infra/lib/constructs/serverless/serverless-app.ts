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
import { ApiGw } from './apigw';
import { DefaultLambda } from './lambda';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';

export class ServerlessApp extends Construct {
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly nlb: aws_elasticloadbalancingv2.NetworkLoadBalancer;
  public readonly webappS3bucket: aws_s3.Bucket;
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
      rdsProxyEndpoint: string;
      rdsProxyArn: string;
      sgForLambda: aws_ec2.SecurityGroup;
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

    new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'HttpsTarget', {
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      port: 8080,
      vpc: props.vpc,
      healthCheck: { path: '/', port: '8080' },
    });

    const sgForS3VpcEndpoint = new aws_ec2.SecurityGroup(this, 'SgForS3VpcEndpoint', {
      vpc: props.vpc,
    });
    sgForS3VpcEndpoint.addIngressRule(sgForAlb, aws_ec2.Port.tcp(80));

    const s3InterfaceEndpoint = props.vpc.addInterfaceEndpoint('S3InterfaceEndpoint', {
      service: aws_ec2.InterfaceVpcEndpointAwsService.S3,
      subnets: { subnets: props.vpc.isolatedSubnets },
      privateDnsEnabled: true,
    });

    // use CDK custom resources to get the Network Interfaces and IP addresses of the API Endpoint
    // get IP Address from S3 VPC Endpoint
    // See here : https://repost.aws/ja/questions/QUjISNyk6aTA6jZgZQwKWf4Q/how-to-connect-a-load-balancer-and-an-interface-vpc-endpoint-together-using-cdk?sc_ichannel=ha&sc_ilang=en&sc_isite=repost&sc_iplace=hp&sc_icontent=QUjISNyk6aTA6jZgZQwKWf4Q&sc_ipos=7
    const eni = new custom_resources.AwsCustomResource(this, 'DescribeNetworkInterfaces', {
      onCreate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: s3InterfaceEndpoint.vpcEndpointNetworkInterfaceIds,
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
      },
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: s3InterfaceEndpoint.vpcEndpointNetworkInterfaceIds,
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

    // Import Web App S3
    const s3Buckets = new WebAppBucket(this, 'WebappBucket', {
      bucketName: `app.${props.domainName}`,
    });
    this.webappS3bucket = s3Buckets.webAppBucket;

    // create ALB Target Group (for s3)
    // ALB health checks Host headers will not contain a domain name, so S3 will return a non-200 HTTP response code. Add “307,405” to the health check success codes. Select “Next”.
    // See here : https://aws.amazon.com/jp/blogs/networking-and-content-delivery/hosting-internal-https-static-websites-with-alb-s3-and-privatelink/
    const vpcEndpointTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(
      this,
      'VpcEndpointTargetGroup',
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
    // get isolated subnets num
    const numOfIp = props.vpc.isolatedSubnets.length;
    for (let i = 0; i < numOfIp; i++) {
      vpcEndpointTargetGroup.addTarget(
        new aws_elasticloadbalancingv2_targets.IpTarget(
          eni.getResponseField(`NetworkInterfaces.${i}.PrivateIpAddress`)
        )
      );
    }
    httpsListener.addTargetGroups('VPCEndpointTargetGroup', {
      targetGroups: [vpcEndpointTargetGroup],
    });
    s3Buckets.webAppBucket.addToResourcePolicy(
      new aws_iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [new aws_iam.AnyPrincipal()],
        effect: aws_iam.Effect.ALLOW,
        resources: [s3Buckets.webAppBucket.bucketArn, s3Buckets.webAppBucket.bucketArn + '/*'],
        conditions: {
          StringEquals: {
            'aws:SourceVpce': [s3InterfaceEndpoint.vpcEndpointId],
          },
        },
      })
    );
    // ApiGw
    const apiGw = new ApiGw(this, `WebappApiGw`, {
      vpc: props.vpc,
    });

    // add resource
    const sampleResource = apiGw.addResource('sample');
    const methodResponses: aws_apigateway.MethodResponse[] = [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Content-Type': true,
          'method.response.header.Access-Control-Allow-Origin': true,
          'method.response.header.Access-Control-Allow-Credentials': true,
          'method.response.header.Access-Control-Allow-Methods': true,
        },
      },
      {
        statusCode: '400',
        responseParameters: {
          'method.response.header.Content-Type': true,
          'method.response.header.Access-Control-Allow-Origin': true,
          'method.response.header.Access-Control-Allow-Credentials': true,
          'method.response.header.Access-Control-Allow-Methods': true,
        },
      },
    ];
    const integrationResponses: aws_apigateway.IntegrationResponse[] = [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Content-Type': 'integration.response.header.Content-Type',
          'method.response.header.Access-Control-Allow-Origin':
            'integration.response.header.Access-Control-Allow-Origin',
          'method.response.header.Access-Control-Allow-Credentials':
            'integration.response.header.Access-Control-Allow-Credentials',
          'method.response.header.Access-Control-Allow-Methods':
            'integration.response.header.Access-Control-Allow-Methods',
        },
      },
      {
        selectionPattern: '(\n|.)+',
        statusCode: '400',
        responseTemplates: {
          'application/json': JSON.stringify({
            state: 'error',
            message: "$util.escapeJavaScript($input.path('$.errorMessage'))",
          }),
        },
      },
    ];
    const lambdaProps = {
      vpc: props.vpc,
      auroraSecretName: props.auroraSecretName,
      auroraSecretArn: props.auroraSecretArn,
      auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
      rdsProxyEndpoint: props.rdsProxyEndpoint,
      rdsProxyArn: props.rdsProxyArn,
      sgForLambda: props.sgForLambda,
    };
    const getLambda = new DefaultLambda(this, 'sampleGet', {
      entry: path.join(__dirname, '../../../../functions/get.ts'),
      ...lambdaProps,
    });
    const postLambda = new DefaultLambda(this, 'samplePost', {
      entry: path.join(__dirname, '../../../../functions/post.ts'),
      ...lambdaProps,
    });

    sampleResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getLambda.lambda, {
        integrationResponses: integrationResponses,
      }),
      {
        methodResponses: methodResponses,
      }
    );
    //POST/sample
    sampleResource.addMethod(
      'POST',
      new aws_apigateway.LambdaIntegration(postLambda.lambda, {
        integrationResponses: integrationResponses,
      }),
      {
        methodResponses: methodResponses,
      }
    );
    // allow alb to ApiGw
    apiGw.vpcEndpointSecurityGroup.addIngressRule(sgForAlb, aws_ec2.Port.tcp(443));
    // use CDK custom resources to get the Network Interfaces and IP addresses of the API Endpoint
    // get IP Address from ApiGw VPC Endpoint
    // See here : https://repost.aws/ja/questions/QUjISNyk6aTA6jZgZQwKWf4Q/how-to-connect-a-load-balancer-and-an-interface-vpc-endpoint-together-using-cdk?sc_ichannel=ha&sc_ilang=en&sc_isite=repost&sc_iplace=hp&sc_icontent=QUjISNyk6aTA6jZgZQwKWf4Q&sc_ipos=7
    const apiGwEni = new custom_resources.AwsCustomResource(
      this,
      'DescribeNetworkInterfacesApiGw',
      {
        onCreate: {
          service: 'EC2',
          action: 'describeNetworkInterfaces',
          parameters: {
            NetworkInterfaceIds: apiGw.privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
          },
          physicalResourceId: custom_resources.PhysicalResourceId.of(Date.now().toString()),
        },
        onUpdate: {
          service: 'EC2',
          action: 'describeNetworkInterfaces',
          parameters: {
            NetworkInterfaceIds: apiGw.privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
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
      }
    );
    // create ALB Target Group (for ApiGw)
    // For health check http code, add 403
    // See here : https://repost.aws/ja/knowledge-center/invoke-private-api-gateway
    const apiGwTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(
      this,
      'ApiGwTarget',
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
    for (let i = 0; i < numOfIp; i++) {
      apiGwTargetGroup.addTarget(
        new aws_elasticloadbalancingv2_targets.IpTarget(
          apiGwEni.getResponseField(`NetworkInterfaces.${i}.PrivateIpAddress`)
        )
      );
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
      const sgForTestVpcEndpoint = new aws_ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
        vpc: props.privateLinkVpc,
      });

      // For Private Link
      const privateLink = props.privateLinkVpc.addInterfaceEndpoint('TestVpcEndpoint', {
        service: new aws_ec2.InterfaceVpcEndpointService(endpointService.vpcEndpointServiceName),
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [sgForTestVpcEndpoint],
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
    // Create the API domain
    const apiDomain = new aws_apigateway.DomainName(this, 'apiDomain', {
      domainName: `app.${props.domainName}`,
      certificate: aws_certificatemanager.Certificate.fromCertificateArn(
        this,
        'certificate',
        props.certificateArn
      ),
      endpointType: aws_apigateway.EndpointType.REGIONAL, // API domains can only be created for Regional endpoints, but it will work with the Private endpoint anyway
      securityPolicy: aws_apigateway.SecurityPolicy.TLS_1_2,
    });
    new aws_apigateway.BasePathMapping(this, 'ApiGwPathMapping', {
      basePath: 'apigw',
      domainName: apiDomain,
      restApi: apiGw.privateApi,
    });
    httpsListener.addAction('apis', {
      action: aws_elasticloadbalancingv2.ListenerAction.forward([apiGwTargetGroup]),
      conditions: [aws_elasticloadbalancingv2.ListenerCondition.pathPatterns([`/apigw/*`])],
      priority: 1,
    });
    httpsListener.addAction('Fixed', {
      priority: 5,
      conditions: [aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(['/'])],
      action: aws_elasticloadbalancingv2.ListenerAction.redirect({
        protocol: aws_elasticloadbalancingv2.Protocol.HTTPS,
        host: '#{host}',
        path: '/index.html',
        query: '#{query}',
      }),
    });
  NagSuppressions.addResourceSuppressions(
      apiGw.privateApi,
      [
        {
          id: 'AwsSolutions-COG4',
          reason: 'This ApiGw does not use an authorizer, because its sample.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      apiGw.privateApi,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason: 'This ApiGw does not use an authorizer, because its sample.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      apiGw.privateApi,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CloudWatchRole managed by SDK.',
        },
      ],
      true
    );
  }
}
