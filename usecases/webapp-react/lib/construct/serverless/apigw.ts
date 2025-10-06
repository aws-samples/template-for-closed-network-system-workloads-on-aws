import { aws_apigateway, aws_ec2, aws_iam, aws_logs, aws_lambda } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { EncryptionKey } from '../kms/key';

// private ApiGw with vpc endpoint
export class ApiGw extends Construct {
  public readonly vpcEndpointSecurityGroup: aws_ec2.SecurityGroup;
  public readonly privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
  public readonly privateApi: aws_apigateway.RestApi;

  public addResource: (resourceName: string) => aws_apigateway.Resource;

  // デフォルトのMethodResponsesとIntegrationResponsesを定義
  private readonly defaultMethodResponses: aws_apigateway.MethodResponse[] = [
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

  private readonly defaultIntegrationResponses: aws_apigateway.IntegrationResponse[] = [
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

  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
      vpcEndpointSecurityGroup: aws_ec2.SecurityGroup;
    }
  ) {
    super(scope, id);

    // Use externally provided VPC Endpoint and Security Group
    this.privateApiVpcEndpoint = props.privateApiVpcEndpoint;
    this.vpcEndpointSecurityGroup = props.vpcEndpointSecurityGroup;

    // API Gateway LogGroup
    const restApiLogAccessLogGroup = new aws_logs.LogGroup(this, 'RestApiLogAccessLogGroup', {
      retention: aws_logs.RetentionDays.THREE_MONTHS,
      encryptionKey: new EncryptionKey(this, 'RestApiLogAccessLogGroupEncryptionKey', {
        servicePrincipals: [new aws_iam.ServicePrincipal('logs.amazonaws.com')],
      }).encryptionKey,
    });

    // API Gateway
    this.privateApi = new aws_apigateway.RestApi(this, 'privateApi', {
      restApiName: `${id}-apigateway`,
      deployOptions: {
        dataTraceEnabled: true,
        loggingLevel: aws_apigateway.MethodLoggingLevel.INFO,
        accessLogDestination: new aws_apigateway.LogGroupLogDestination(restApiLogAccessLogGroup),
        accessLogFormat: aws_apigateway.AccessLogFormat.clf(),
        tracingEnabled: true,
      },
      endpointConfiguration: {
        types: [aws_apigateway.EndpointType.PRIVATE],
        vpcEndpoints: [this.privateApiVpcEndpoint],
      },
      policy: new aws_iam.PolicyDocument({
        statements: [
          new aws_iam.PolicyStatement({
            principals: [new aws_iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*'],
            effect: aws_iam.Effect.DENY,
            conditions: {
              StringNotEquals: {
                'aws:SourceVpce': this.privateApiVpcEndpoint.vpcEndpointId,
              },
            },
          }),
          new aws_iam.PolicyStatement({
            principals: [new aws_iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*'],
            effect: aws_iam.Effect.ALLOW,
          }),
        ],
      }),
    });

    // Request Validator
    this.privateApi.addRequestValidator('validate-request', {
      requestValidatorName: 'my-request-validator',
      validateRequestBody: true,
      validateRequestParameters: true,
    });
    this.addResource = (resourceName: string) => {
      return this.privateApi.root.addResource(resourceName, {
        defaultCorsPreflightOptions: {
          allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
          allowMethods: aws_apigateway.Cors.ALL_METHODS,
          allowHeaders: aws_apigateway.Cors.DEFAULT_HEADERS,
          disableCache: true,
        },
      });
    };

    // NagSuppressions
    NagSuppressions.addResourceSuppressions(
      this.vpcEndpointSecurityGroup,
      [
        {
          id: 'AwsSolutions-EC23',
          reason: 'This is Sample, so API Gateway is open to everyone.',
        },
      ],
      true
    );
  }

  public addMethodWithLambdaIntegration(
    resource: aws_apigateway.Resource,
    httpMethod: string,
    lambda: aws_lambda.Function,
    options?: {
      customMethodResponses?: aws_apigateway.MethodResponse[];
      customIntegrationResponses?: aws_apigateway.IntegrationResponse[];
    }
  ): aws_apigateway.Method {
    const methodResponses = options?.customMethodResponses || this.defaultMethodResponses;
    const integrationResponses = options?.customIntegrationResponses || this.defaultIntegrationResponses;

    return resource.addMethod(
      httpMethod,
      new aws_apigateway.LambdaIntegration(lambda, {
        integrationResponses: integrationResponses,
      }),
      {
        methodResponses: methodResponses,
      }
    );
  }
}
