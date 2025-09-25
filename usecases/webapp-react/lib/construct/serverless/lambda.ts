import {
  aws_lambda_nodejs,
  aws_kms,
  aws_lambda,
  aws_ec2,
  aws_iam,
  aws_secretsmanager,
  Duration,
  Fn,
  Stack,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class DefaultLambda extends Construct {
  public readonly lambda: aws_lambda_nodejs.NodejsFunction;

  constructor(
    scope: Construct,
    id: string,
    props: {
      entry: string;
      vpc: aws_ec2.IVpc;
      dbSecretName: string;
      dbSecretArn: string;
      dbSecretEncryptionKeyArn: string;
      dbProxyEndpoint: string;
      dbProxyArn: string;
      sgForLambda: aws_ec2.SecurityGroup;
    }
  ) {
    super(scope, id);

    const lambdaFunctionRole = new aws_iam.Role(this, 'lambdaFunctionRole', {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      path: '/service-role/',
    });
    lambdaFunctionRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        'awsLambdaBasicExectionRole',
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      )
    );
    lambdaFunctionRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        'awsLambdaVpcExectionRole',
        'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'
      )
    );
    lambdaFunctionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.dbSecretArn],
      })
    );
    lambdaFunctionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [props.dbSecretEncryptionKeyArn],
      })
    );
    const lastOfArn = Fn.select(6, Fn.split(':', props.dbProxyArn));
    const key = aws_kms.Key.fromKeyArn(this, 'ImportedKey', props.dbSecretEncryptionKeyArn);
    const secret = aws_secretsmanager.Secret.fromSecretAttributes(this, 'ImportedSecret', {
      secretCompleteArn: props.dbSecretArn,
      encryptionKey: key,
    });
    const user = secret.secretValueFromJson('username').unsafeUnwrap().toString();
    const proxyUser = `arn:aws:rds-db:${Stack.of(this).region}:${
      Stack.of(this).account
    }:dbuser:${lastOfArn}/${user}`;
    lambdaFunctionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [proxyUser],
      })
    );
    this.lambda = new aws_lambda_nodejs.NodejsFunction(this, `${id}Lambda`, {
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED }),
      securityGroups: [props.sgForLambda],
      runtime: aws_lambda.Runtime.NODEJS_22_X,
      entry: props.entry,
      architecture: aws_lambda.Architecture.ARM_64,
      memorySize: 256,
      role: lambdaFunctionRole,
      timeout: Duration.seconds(60),
      environment: {
        SECRET_NAME: props.dbSecretName,
      },
      bundling: {
        forceDockerBundling: false,
        define: {},
        minify: true,
      },
      tracing: aws_lambda.Tracing.ACTIVE,
    });
    //Suppressions
    NagSuppressions.addResourceSuppressions(
      lambdaFunctionRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaBasicExecutionRole managed by SDK.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      lambdaFunctionRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      lambdaFunctionRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],
      true
    );
  }
}
