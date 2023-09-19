import { aws_apigateway, aws_ec2,aws_lambda_nodejs,aws_lambda,aws_iam,aws_logs,custom_resources,CustomResource,Fn,aws_secretsmanager,aws_kms } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path'
import { NagSuppressions } from 'cdk-nag';
import { BundlingOptions, Duration, ILocalBundling } from 'aws-cdk-lib';
import { execFileSync } from 'child_process';

export class LocalBundler implements ILocalBundling {
  tryBundle(outputDir: string, options: BundlingOptions): boolean {
    try {
      const result = execFileSync(path.resolve(__dirname, 'bundle.sh'), {
        env: {
          PATH: process.env.PATH,
          BUNDLER_OUTPUT_DIR: outputDir,
          BUNDLER_ROOT_DIR: path.resolve(__dirname, '../lambda-layer'),
        },
        timeout: Duration.seconds(60).toMilliseconds(),
        encoding: 'utf-8',
      });
      return true;
    } catch (e: any) {
      console.error(e);
      return false;
    }
  }
}

// private Apigw with vpc endpoint
export class Apigw extends Construct {
    public readonly vpcEndpointSecurityGroup: aws_ec2.SecurityGroup;
    public readonly privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
    public readonly privateApi : aws_apigateway.LambdaRestApi;
    public readonly lambdaFunctionRole : aws_iam.Role;
    public readonly sgForLambda : aws_ec2.SecurityGroup;
    constructor(
        scope: Construct,
        id: string,
        props: {
            vpc: aws_ec2.IVpc;
            auroraSecretName: string;
            auroraSecretArn: string;
            auroraSecurityGroupId: string;
            auroraSecretEncryptionKeyArn: string;
            auroraEdition: string;
            rdsProxyEndpoint:string;
            rdsProxyArn:string;
        }
    ) {
        super(scope,id);
        this.vpcEndpointSecurityGroup = new aws_ec2.SecurityGroup(this, 'vpcEndpointSecurityGroup', {
            vpc: props.vpc,
            allowAllOutbound: true,
          });
        
        // VPC endpoint
        this.privateApiVpcEndpoint = new aws_ec2.InterfaceVpcEndpoint(this, "privateApiVpcEndpoint", {
            vpc:props.vpc,
            service: aws_ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
            privateDnsEnabled: true,
            subnets: {subnets: props.vpc.isolatedSubnets},
            securityGroups: [this.vpcEndpointSecurityGroup],
            open: false,
        });
        // Lambda IAM Settings
        this.lambdaFunctionRole = new aws_iam.Role(this,'lambdaFunctionRole',{
          assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
          path: '/service-role/' 
        })
        this.lambdaFunctionRole.addManagedPolicy(aws_iam.ManagedPolicy.fromManagedPolicyArn(this,'awslambdabasicexectionrole',"arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"))
        this.lambdaFunctionRole.addManagedPolicy(aws_iam.ManagedPolicy.fromManagedPolicyArn(this,'awslambdavpcexectionrole',"arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"))
        this.lambdaFunctionRole.addToPolicy(new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ["secretsmanager:GetSecretValue"],
          resources: [props.auroraSecretArn]
        }))
        this.lambdaFunctionRole.addToPolicy(new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: [props.auroraSecretEncryptionKeyArn],
        }))
        const lastOfArn=Fn.select(6,Fn.split(":",props.rdsProxyArn)); //(String(props.rdsProxyArn)).split(":")[6];
        const key = aws_kms.Key.fromKeyArn(this,"ImportedKey",props.auroraSecretEncryptionKeyArn)
        const secret = aws_secretsmanager.Secret.fromSecretAttributes(this, "ImportedSecret", {
          secretCompleteArn:props.auroraSecretArn,
          encryptionKey:key
        });
        const user =secret.secretValueFromJson('username').unsafeUnwrap().toString();
        const proxyUser=`arn:aws:rds-db:ap-northeast-1:${props.vpc.env.account}:dbuser:${lastOfArn}/${user}`
        this.lambdaFunctionRole.addToPolicy(new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ["rds-db:connect"],
          resources: [proxyUser]
        }))
        //Aurora and APIGW  SG Settings
        const sgForAurora = aws_ec2.SecurityGroup.fromSecurityGroupId(
          this,
          'AuroraSecurityGroup',
          props.auroraSecurityGroupId
        );
        this.sgForLambda = new aws_ec2.SecurityGroup(this, 'APIGWSecurityGroup', {
          vpc: props.vpc,
          allowAllOutbound: true,
        });
        if(props.auroraEdition=="mysql"){
          sgForAurora.addIngressRule(
            this.sgForLambda,
            aws_ec2.Port.tcp(3306)
          )
        }else{
          sgForAurora.addIngressRule(
            this.sgForLambda ,
            aws_ec2.Port.tcp(5432)
          )
        }
        
        //lambda functions
        const sampleGetLambdaFunction = new aws_lambda_nodejs.NodejsFunction(this, "lambdaGetFunction", {
          vpc:props.vpc,
          vpcSubnets:props.vpc.selectSubnets({ subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED }),
          securityGroups:[this.sgForLambda],
          runtime: aws_lambda.Runtime.NODEJS_18_X,
          entry: path.join(__dirname, '../../../functions/get.ts'),
          architecture: aws_lambda.Architecture.ARM_64,
          memorySize: 256,
          role: this.lambdaFunctionRole,
          timeout: Duration.seconds(600),
          environment: {
            SECRET_NAME: props.auroraSecretName,
            REGION: props.vpc.env.region.toString(),
            HOST: props.rdsProxyEndpoint
          },
          bundling: {
            forceDockerBundling: false, 
            define: {},
            minify: true,
         }
        });
        const samplePostLambdaFunction = new aws_lambda_nodejs.NodejsFunction(this, "lambdaPostFunction", {
          vpc:props.vpc,
          vpcSubnets:props.vpc.selectSubnets({ subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED }),
          securityGroups:[this.sgForLambda],
          runtime: aws_lambda.Runtime.NODEJS_18_X,
          entry: path.join(__dirname, '../../../functions/post.ts'),
          architecture: aws_lambda.Architecture.ARM_64,
          memorySize: 256,
          role: this.lambdaFunctionRole,
          timeout: Duration.seconds(600),
          environment: {
            SECRET_NAME: props.auroraSecretName,
            REGION: props.vpc.env.region.toString(),
            HOST: props.rdsProxyEndpoint
          },
          bundling: {
            forceDockerBundling: false, 
            define: {},
            minify: true,
         }
        });

        // API Gateway LogGroup
        const restApiLogAccessLogGroup = new aws_logs.LogGroup(
          this,
          'RestApiLogAccessLogGroup',
          {
            retention: 365,
          },
        );
  
        // API Gateway
        this.privateApi = new aws_apigateway.RestApi(this, 'privateApi', {
          restApiName:`${id}-apigateway`,
          deployOptions: {
            dataTraceEnabled: true,
            loggingLevel: aws_apigateway.MethodLoggingLevel.INFO,
            accessLogDestination: new aws_apigateway.LogGroupLogDestination(
              restApiLogAccessLogGroup,
            ),
            accessLogFormat: aws_apigateway.AccessLogFormat.clf(),
          },
          endpointConfiguration: {
            types: [aws_apigateway.EndpointType.PRIVATE],
            vpcEndpoints: [this.privateApiVpcEndpoint],
          },
          policy: new aws_iam.PolicyDocument({
            statements: [
              new aws_iam.PolicyStatement({
                principals: [new aws_iam.AnyPrincipal],
                actions: ['execute-api:Invoke'],
                resources: ['execute-api:/*'],
                effect: aws_iam.Effect.DENY,
                conditions: {
                  StringNotEquals: {
                    "aws:SourceVpce": this.privateApiVpcEndpoint.vpcEndpointId
                  }
                }
              }),
              new aws_iam.PolicyStatement({
                principals: [new aws_iam.AnyPrincipal],
                actions: ['execute-api:Invoke'],
                resources: ['execute-api:/*'],
                effect: aws_iam.Effect.ALLOW
              })
            ]
        })
      });
      

      // Request Validator
      this.privateApi.addRequestValidator("validate-request", {
        requestValidatorName: "my-request-validator",
        validateRequestBody: true,
        validateRequestParameters: true,
      });
      ///sample
      const sample = this.privateApi.root.addResource("sample",{
        defaultCorsPreflightOptions: {
          allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
          allowMethods: aws_apigateway.Cors.ALL_METHODS,
          allowHeaders: aws_apigateway.Cors.DEFAULT_HEADERS,
          disableCache: true,
        }
      });
      const methodResponses=[
        {
          statusCode:"200",
          responseParameters:{
            'method.response.header.Content-Type': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Methods' :true,
          }
        },
        {
          statusCode:"400",
          responseParameters:{
            'method.response.header.Content-Type': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Methods' :true,
          }
        }
      ]
      const integrationResponses=[
        {
          statusCode: "200",
          responseParameters:{
            'method.response.header.Content-Type': "integration.response.header.Content-Type",
            'method.response.header.Access-Control-Allow-Origin': "integration.response.header.Access-Control-Allow-Origin",
            'method.response.header.Access-Control-Allow-Credentials': "integration.response.header.Access-Control-Allow-Credentials",
            'method.response.header.Access-Control-Allow-Methods' : "integration.response.header.Access-Control-Allow-Methods",
          }
        },
        {
          selectionPattern: '(\n|.)+',
          statusCode: "400",
          responseTemplates: {
              'application/json': JSON.stringify({ state: 'error', message: "$util.escapeJavaScript($input.path('$.errorMessage'))" })
          },
        }
      ]
      //GET/sample
      sample.addMethod("GET", 
        new aws_apigateway.LambdaIntegration(sampleGetLambdaFunction,{
            integrationResponses: integrationResponses
          }
        ),{
          methodResponses:methodResponses
        }
      )
      //POST/sample
      sample.addMethod("POST", 
        new aws_apigateway.LambdaIntegration(samplePostLambdaFunction,{
          integrationResponses: integrationResponses
        }
      ),{
        methodResponses:methodResponses
      })



      // NagSuppressions
      
      NagSuppressions.addResourceSuppressions(this.privateApi, [
        {
          id: 'AwsSolutions-COG4',
          reason: 'This APIGW does not use an authorizer, because its sample.',
        },
      ],true);
      NagSuppressions.addResourceSuppressions(this.privateApi, [
        {
          id: 'AwsSolutions-APIG4',
          reason: 'This APIGW does not use an authorizer, because its sample.',
        },
      ],true);
      NagSuppressions.addResourceSuppressions(this.privateApi, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CloudWatchRole managed by SDK.',
        },
      ],true);
      NagSuppressions.addResourceSuppressions(this.lambdaFunctionRole, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaBasicExecutionRole managed by SDK.',
        },
      ],true);
      NagSuppressions.addResourceSuppressions(this.vpcEndpointSecurityGroup, [
        {
          id: 'AwsSolutions-EC23',
          reason: 'This is Sample, so API Gateway is open to everyone.',
        },
      ],true);


    //Suppressions
    NagSuppressions.addResourceSuppressions(this.lambdaFunctionRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'This is Custom Resource managed by AWS',
      },
    ],true);
    NagSuppressions.addResourceSuppressions(this.lambdaFunctionRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'This is Custom Resource managed by AWS',
      },
    ],true);
    }
    
}