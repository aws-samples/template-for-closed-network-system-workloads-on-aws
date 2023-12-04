import {
  aws_lambda_nodejs,
  aws_lambda,
  aws_ec2,
  aws_iam,
  Duration,
  Fn,
  aws_kms,
  aws_secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class DefaultLambda extends Construct {
  public readonly lambda: aws_lambda_nodejs.NodejsFunction;
  constructor(
    scope: Construct,
    id: string,
    props: {
      resourceId: string;
      entry: string;
      vpc: aws_ec2.IVpc;
      auroraSecretName: string;
      auroraSecretArn: string;
      auroraSecretEncryptionKeyArn: string;
      rdsProxyEndpoint: string;
      rdsProxyArn: string;
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
        'awslambdabasicexectionrole',
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      )
    );
    lambdaFunctionRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        'awslambdavpcexectionrole',
        'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'
      )
    );
    lambdaFunctionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.auroraSecretArn],
      })
    );
    lambdaFunctionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [props.auroraSecretEncryptionKeyArn],
      })
    );
    const lastOfArn = Fn.select(6, Fn.split(':', props.rdsProxyArn)); //(String(props.rdsProxyArn)).split(":")[6];
    const key = aws_kms.Key.fromKeyArn(this, 'ImportedKey', props.auroraSecretEncryptionKeyArn);
    const secret = aws_secretsmanager.Secret.fromSecretAttributes(this, 'ImportedSecret', {
      secretCompleteArn: props.auroraSecretArn,
      encryptionKey: key,
    });
    const user = secret.secretValueFromJson('username').unsafeUnwrap().toString();
    const proxyUser = `arn:aws:rds-db:ap-northeast-1:${props.vpc.env.account}:dbuser:${lastOfArn}/${user}`;
    lambdaFunctionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [proxyUser],
      })
    );
    this.lambda = new aws_lambda_nodejs.NodejsFunction(this, props.resourceId, {
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED }),
      securityGroups: [props.sgForLambda],
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: props.entry,
      architecture: aws_lambda.Architecture.ARM_64,
      memorySize: 256,
      role: lambdaFunctionRole,
      timeout: Duration.seconds(600),
      environment: {
        SECRET_NAME: props.auroraSecretName,
        HOST: props.rdsProxyEndpoint,
      },
      bundling: {
        forceDockerBundling: false,
        define: {},
        minify: true,
      },
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
