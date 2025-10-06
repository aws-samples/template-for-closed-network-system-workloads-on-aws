import {
  aws_ec2,
  aws_elasticloadbalancingv2,
  aws_s3,
  aws_apigateway,
  aws_certificatemanager,
  aws_iam,
} from 'aws-cdk-lib';
import { Bucket } from '../s3/bucket';
import { Construct } from 'constructs';
import { ApiGw } from './apigw';
import { DefaultLambda } from './lambda';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';

export class ServerlessApp extends Construct {
  public readonly apiGw: ApiGw;
  public readonly webappS3bucket: aws_s3.Bucket;
  public readonly sgForLambda: aws_ec2.SecurityGroup;
  public readonly apiDomain: aws_apigateway.DomainName;

  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      domainName: string;
      certificateArn: string;
      dbSecretName: string;
      dbSecretArn: string;
      dbSecurityGroupId: string;
      dbSecretEncryptionKeyArn: string;
      dbProxyEndpoint: string;
      dbProxyArn: string;
      spaS3InterfaceEndpoint: aws_ec2.InterfaceVpcEndpoint;
      privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
      vpcEndpointSecurityGroup: aws_ec2.SecurityGroup;
    }
  ) {
    super(scope, id);

    // Security Group for Lambda
    this.sgForLambda = new aws_ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: 'Security group for Lambda functions',
    });

    // API Gateway
    this.apiGw = new ApiGw(this, 'WebappApiGw', {
      vpc: props.vpc,
      privateApiVpcEndpoint: props.privateApiVpcEndpoint,
      vpcEndpointSecurityGroup: props.vpcEndpointSecurityGroup,
    });

    // Add API Gateway resource and methods
    const sampleResource = this.apiGw.addResource('sample');
    const lambdaProps = {
      vpc: props.vpc,
      db: {
        secretName: props.dbSecretName,
        secretArn: props.dbSecretArn,
        secretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
        proxyEndpoint: props.dbProxyEndpoint,
        proxyArn: props.dbProxyArn,
      },
      sgForLambda: this.sgForLambda,
    };

    const getLambda = new DefaultLambda(this, 'sampleGet', {
      entry: path.join(__dirname, '../../../functions/get.ts'),
      ...lambdaProps,
    });
    const postLambda = new DefaultLambda(this, 'samplePost', {
      entry: path.join(__dirname, '../../../functions/post.ts'),
      ...lambdaProps,
    });

    // Add methods to API Gateway
    this.apiGw.addMethodWithLambdaIntegration(sampleResource, 'GET', getLambda.lambda);
    this.apiGw.addMethodWithLambdaIntegration(sampleResource, 'POST', postLambda.lambda);

    // S3 Bucket for Web App
    const s3Buckets = new Bucket(this, 'WebappBucket', {
      bucketName: `app.${props.domainName}`,
      versioned: false,
    });
    this.webappS3bucket = s3Buckets.bucket;

    // S3 Bucket Policy for VPC Endpoint access
    this.webappS3bucket.addToResourcePolicy(
      new aws_iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [new aws_iam.AnyPrincipal()],
        effect: aws_iam.Effect.ALLOW,
        resources: [this.webappS3bucket.bucketArn, `${this.webappS3bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'aws:SourceVpce': [props.spaS3InterfaceEndpoint.vpcEndpointId],
          },
        },
      })
    );

    // API Domain
    this.apiDomain = new aws_apigateway.DomainName(this, 'apiDomain', {
      domainName: `app.${props.domainName}`,
      certificate: aws_certificatemanager.Certificate.fromCertificateArn(
        this,
        'certificate',
        props.certificateArn
      ),
      endpointType: aws_apigateway.EndpointType.REGIONAL,
      securityPolicy: aws_apigateway.SecurityPolicy.TLS_1_2,
    });

    // Base Path Mapping
    new aws_apigateway.BasePathMapping(this, 'ApiGwPathMapping', {
      basePath: 'apigw',
      domainName: this.apiDomain,
      restApi: this.apiGw.privateApi,
    });

    // CDK NAG Suppressions
    NagSuppressions.addResourceSuppressions(
      this.apiGw.privateApi,
      [
        {
          id: 'AwsSolutions-COG4',
          reason: 'This ApiGw does not use an authorizer, because its sample.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      this.apiGw.privateApi,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason: 'This ApiGw does not use an authorizer, because its sample.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      this.apiGw.privateApi,
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
