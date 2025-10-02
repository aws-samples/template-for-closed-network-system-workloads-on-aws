import { CfnOutput, StackProps, Stack, aws_dynamodb, aws_ec2, aws_iam, aws_cognito, aws_lambda, aws_sqs, aws_lambda_event_sources, aws_events, aws_events_targets, aws_cognito_identitypool, Duration, CfnJson } from 'aws-cdk-lib';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { UserPoolAuthenticationProvider } from 'aws-cdk-lib/aws-cognito-identitypool';

interface InfraopsConsoleStackProps extends StackProps {
  sourceVpcId: string;
  appRunnerVpcEndpointId: string;
}

export class InfraopsConsoleStack extends Stack {
  public readonly userTable: aws_dynamodb.Table;
  public readonly userPool: aws_cognito.UserPool;
  public readonly userPoolClient: aws_cognito.UserPoolClient;
  public readonly idPool: aws_cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: InfraopsConsoleStackProps) {
    super(scope, id, props);

    const sourceVpc = aws_ec2.Vpc.fromLookup(this, 'SourceVpc', {vpcId: props.sourceVpcId});
    const interfaceVpcEndpoint = aws_ec2.InterfaceVpcEndpoint.fromInterfaceVpcEndpointAttributes(this, 'AppRunnerVpcEndpoint', {
      vpcEndpointId: props.appRunnerVpcEndpointId,
      port: 443
    })

    // Create SQS FIFO queue
    const instanceDeadLetterQueue = new aws_sqs.Queue(this,'InstanceDeadLetterQueue', {
      fifo: true,
      enforceSSL: true
    });
    const instanceQueue = new aws_sqs.Queue(this, 'InstanceQueue', {
      fifo: true,
      contentBasedDeduplication: true, // Enable deduplication
      queueName: 'ice-instance-recovery-queue.fifo',
      enforceSSL: true,
      deadLetterQueue: {
        queue: instanceDeadLetterQueue,
        maxReceiveCount: 50
      }
    });

    // Create Lambda function
    const iceRecoveryFunction = new NodejsFunction(this, 'IceRecoveryFunction', {
      runtime: aws_lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../functions/ice-recovery/index.ts'),
    });

    // Grant permissions for EC2 instances
    iceRecoveryFunction.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'ec2:DescribeInstances',
        'ec2:StartInstances',
        'ec2:StopInstances',
        'ec2:RunInstances',
        'ec2:ModifyInstanceAttribute'
      ],
      resources: ['*']
    }));

    // Connect SQS trigger to Lambda
    iceRecoveryFunction.addEventSource(new aws_lambda_event_sources.SqsEventSource(instanceQueue, {
      batchSize: 1,
    }));

    // Grant permission for Lambda to receive messages from queue
    instanceQueue.grantConsumeMessages(iceRecoveryFunction);
    
    // Create EventBridge Scheduler execution role
    const schedulerExecutionRole = new aws_iam.Role(this, 'EventBridgeSchedulerExecutionRole', {
      roleName: 'EventBridgeSchedulerExecutionRole',
      assumedBy: new aws_iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Role for EventBridge Scheduler to execute EC2 actions'
    });
    
    // Grant EC2 instance start/stop permissions
    schedulerExecutionRole.addToPolicy(new aws_iam.PolicyStatement({
      actions: [
        'ec2:StartInstances',
        'ec2:StopInstances'
      ],
      resources: ['*']
    }));

    // Rule to queue ICE log events to SQS as triggers
    new aws_events.Rule(this, 'IceEventRule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['ec2.amazonaws.com'],
          eventName: ['StartInstances', 'RunInstances'], // Catch startup-related events
          errorCode: ['Server.InsufficientInstanceCapacity']
        },
      },
      targets: [new aws_events_targets.SqsQueue(instanceQueue, {
        message: aws_events.RuleTargetInput.fromObject({
          // Pack instance ID from logs into message
          instanceId: aws_events.EventField.fromPath('$.detail.requestParameters.instancesSet.items[0].instanceId'),
        }),
        // FIFO queues require message group ID, so we need to determine one (using instance ID for simplicity here)
        messageGroupId: aws_events.EventField.fromPath('$.detail.requestParameters.instancesSet.items[0].instanceId'),
      })]
    });

    // Create Cognito User Pool
    this.userPool = new aws_cognito.UserPool(this, 'InfraopsConsoleUserPool', {
      userPoolName: 'infraops-console-user-pool',
      selfSignUpEnabled: false, // Only administrators can create users
      signInAliases: {
        email: true // Enable sign-in with email address
      },
      autoVerify: {
        email: true // Enable automatic email verification
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        }
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
      customAttributes: {
        "groupId": new aws_cognito.StringAttribute({ mutable: true })
      }
    });
    this.userPool.addGroup('Admins', {
      groupName: 'Admins',
      description: 'Administrators group with full access'
    });
    this.userPool.addGroup('Users', {
      groupName: 'Users',
      description: 'Regular users group with limited access'
    });

    // Configure User Pool domain
    const userPoolDomain = this.userPool.addDomain('InfraopsConsoleDomain', {
      cognitoDomain: {
        domainPrefix: `infraops-console-${this.account.substring(0, 8)}`
      },
    });

    // Create User Pool client
    this.userPoolClient = this.userPool.addClient('InfraopsConsoleClient', {
      userPoolClientName: 'infraops-console-client',
      idTokenValidity: Duration.minutes(60),
      accessTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(1),
      authFlows: {
        adminUserPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false
        },
        scopes: [
          aws_cognito.OAuthScope.EMAIL,
          aws_cognito.OAuthScope.OPENID,
          aws_cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          'http://localhost:3000/auth/callback', // For local development
          `https://${props.appRunnerVpcEndpointId}.execute-api.${this.region}.amazonaws.com/auth/callback` // For production environment
        ],
        logoutUrls: [
          'http://localhost:3000/', // For local development
          `https://${props.appRunnerVpcEndpointId}.execute-api.${this.region}.amazonaws.com/` // For production environment
        ]
      },
      supportedIdentityProviders: [
        aws_cognito.UserPoolClientIdentityProvider.COGNITO
      ],
      generateSecret: true
    });

    // Create Cognito Identity Pool (using CfnIdentityPool)
    this.idPool = new aws_cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true
        }
      ]
    });

    // Create IAM role for Admins (full access permissions)
    const adminRole = new aws_iam.Role(this, 'AdminRole', {
      assumedBy: new aws_iam.CompositePrincipal(
        new aws_iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            "StringEquals": {
              "cognito-identity.amazonaws.com:aud": this.idPool.ref
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "authenticated"
            }
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
        new aws_iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            "StringEquals": {
              "cognito-identity.amazonaws.com:aud": this.idPool.ref
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "authenticated"
            }
          },
          'sts:TagSession'
        ),
      ),
      description: 'Role for Admins group with full access'
    });

    // Policy for Admins (equivalent to existing AuthenticatedUserPolicy)
    adminRole.attachInlinePolicy(new aws_iam.Policy(this, 'AdminPolicy', {
      statements: [
        new aws_iam.PolicyStatement({
          actions: [
            // EC2-related permissions
            "ec2:DescribeInstances",
            "ec2:StartInstances",
            "ec2:StopInstances",
            "ec2:DescribeInstanceTypes",
            "ec2:CreateTags",
            "ec2:GetInstanceTypesFromInstanceRequirements",
            "ec2:DescribeInstanceTypeOfferings",
            // ECS-related permissions
            "ecs:ListClusters",
            "ecs:ListServices",
            "ecs:DescribeServices",
            "ecs:UpdateService",
            // RDS-related permissions
            "rds:DescribeDBClusters",
            "rds:DescribeDBInstances",
            "rds:StopDBCluster",
            "rds:StopDBInstance",
            "rds:StartDBCluster",
            "rds:StartDBInstance",
            "rds:RebootDBCluster",
            "rds:RebootDBInstance",
            // EventBridge Scheduler-related permissions
            "scheduler:CreateSchedule",
            "scheduler:GetSchedule",
            "scheduler:UpdateSchedule",
            "scheduler:DeleteSchedule",
            "scheduler:ListSchedules",
            "scheduler:ListTagsForResource",
            // Admin-only Cognito permissions
            "cognito-idp:ListUsers",
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminDeleteUser",
            "cognito-idp:AdminAddUserToGroup",
            "cognito-idp:AdminRemoveUserFromGroup"
          ],
          resources: ["*"]
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "iam:PassRole"
          ],
          resources: [
            schedulerExecutionRole.roleArn
          ]
        })
      ]
    }));

    // Create IAM role for Users (with ABAC applied)
    const usersRole = new aws_iam.Role(this, 'UsersRole', {
      assumedBy: new aws_iam.CompositePrincipal(
        new aws_iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            "StringEquals": {
              "cognito-identity.amazonaws.com:aud": this.idPool.ref
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "authenticated"
            }
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
        new aws_iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            "StringEquals": {
              "cognito-identity.amazonaws.com:aud": this.idPool.ref
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "authenticated"
            }
          },
          'sts:TagSession'
        ),
      ),
      description: 'Role for Users group with ABAC-based access control'
    });

    // Policy for Users (with ABAC applied)
    usersRole.attachInlinePolicy(new aws_iam.Policy(this, 'UsersGroupPolicy', {
      statements: [
        // EC2-related permissions (with ABAC applied)
        new aws_iam.PolicyStatement({
          actions: [
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceTypes",
            "ec2:GetInstanceTypesFromInstanceRequirements",
            "ec2:DescribeInstanceTypeOfferings",
          ],
          resources: ["*"],
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "ec2:StartInstances",
            "ec2:StopInstances",
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'ec2:ResourceTag/GroupId': '${aws:PrincipalTag/GroupId}'
            }
          }
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "ec2:CreateTags",
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'ec2:ResourceTag/GroupId': '${aws:PrincipalTag/GroupId}'
            },
            'ForAllValues:StringEquals': {
              'aws:TagKeys': ['AlternateType']
            }
          }
        }),
        // ECS-related permissions (with ABAC applied)
        new aws_iam.PolicyStatement({
          actions: [
            "ecs:ListClusters",
            "ecs:ListServices",
          ],
          resources: ["*"],
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "ecs:UpdateService",
            "ecs:DescribeServices",
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'ecs:ResourceTag/GroupId': '${aws:PrincipalTag/GroupId}'
            }
          }
        }),
        // RDS-related permissions (with ABAC applied)
        new aws_iam.PolicyStatement({
          actions: [
            "rds:DescribeDBClusters",
            "rds:DescribeDBInstances",
          ],
          resources: ["*"],
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "rds:StopDBCluster",
            "rds:StopDBInstance",
            "rds:StartDBCluster",
            "rds:StartDBInstance",
            "rds:RebootDBCluster",
            "rds:RebootDBInstance",
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'aws:ResourceTag/GroupId': '${aws:PrincipalTag/GroupId}'
            }
          }
        }),
        // EventBridge Scheduler-related permissions (with ABAC applied)
        new aws_iam.PolicyStatement({
          actions: [
            "scheduler:ListSchedules",
            "scheduler:ListTagsForResource",
            "scheduler:CreateSchedule",
            "scheduler:GetSchedule",
            "scheduler:UpdateSchedule",
            "scheduler:DeleteSchedule",
          ],
          resources: ["*"],
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "scheduler:CreateTags",
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'aws:ResourceTag/GroupId': '${aws:PrincipalTag/GroupId}'
            },
            'ForAllValues:StringEquals': {
              'aws:TagKeys': ['GroupId']
            }
          }
        }),
        // Cognito-related permissions (no ABAC - available to all users)
        new aws_iam.PolicyStatement({
          actions: [
            "cognito-idp:GetUser",
          ],
          resources: ["*"]
        }),
        // PassRole permissions (no ABAC)
        new aws_iam.PolicyStatement({
          actions: [
            "iam:PassRole"
          ],
          resources: [
            schedulerExecutionRole.roleArn
          ]
        })
      ]
    }));

    // Dynamically build roleMappings using CfnJson
    const roleMappingsJson = new CfnJson(this, 'RoleMappingsJson', {
      value: {
        [`cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}:${this.userPoolClient.userPoolClientId}`]: {
          Type: 'Rules',
          AmbiguousRoleResolution: 'Deny',
          RulesConfiguration: {
            Rules: [
              {
                Claim: 'cognito:groups',
                MatchType: 'Contains',
                Value: 'Admins',
                RoleARN: adminRole.roleArn
              },
              {
                Claim: 'cognito:groups',
                MatchType: 'Contains',
                Value: 'Users',
                RoleARN: usersRole.roleArn
              }
            ]
          }
        }
      }
    });

    // Create role mapping (using CfnIdentityPoolRoleAttachment)
    new aws_cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.idPool.ref,
      roleMappings: roleMappingsJson,
      roles: {
        'authenticated': usersRole.roleArn
      }
    });

    // Create PrincipalTag mapping (map custom:groupId to GroupId)
    new aws_cognito.CfnIdentityPoolPrincipalTag(this, 'IdentityPoolPrincipalTag', {
      identityPoolId: this.idPool.ref,
      identityProviderName: this.userPool.userPoolProviderName,
      principalTags: {
        'GroupId': 'custom:groupId',
        'client': 'aud'
      },
      useDefaults: false
    });

    // Build local code and push to ECR
    const instanceManagerAsset = new assets.DockerImageAsset(this, 'InfraopsConsoleDockerImage', {
      directory: path.join(__dirname, '../webapp'),
      cacheDisabled: false,
    });
 
    // Create AppRunner service
    const service = new apprunner.Service(this, 'InfraopsConsoleService', {
      serviceName: 'infraops-console',
      source: apprunner.Source.fromAsset({
        imageConfiguration: {
          port: 3000,
          environmentVariables: {
            SESSION_SECRET: '1nfra0ps-c0ns0l3-s3cr3t',
            CLIENT_ID: this.userPoolClient.userPoolClientId,
            CLIENT_SECRET: this.userPoolClient.userPoolClientSecret.unsafeUnwrap(),
            USER_POOL_ID: this.userPool.userPoolId,
            IDENTITY_POOL_ID: this.idPool.ref,
            DOMAIN: `infraops-console-${Stack.of(this).account}`,
            AWS_REGION: Stack.of(this).region,
            AWS_ACCOUNT_ID: Stack.of(this).account,
            EVENTBRIDGE_SCHEDULER_ROLE_ARN: schedulerExecutionRole.roleArn
          },
        },
        asset: instanceManagerAsset,
        
      }),
      cpu: apprunner.Cpu.ONE_VCPU,
      memory: apprunner.Memory.TWO_GB,
      autoDeploymentsEnabled: true,
      isPubliclyAccessible: false, // For closed network
    });
    service.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: [
          "cloudwatch:Get*",
          "cloudwatch:Describe*",
        ],
        resources: ["*"],
      })
    );
    
    new apprunner.VpcIngressConnection(this, 'VpcIngressConnection', {
      vpc: sourceVpc,
      service,
      interfaceVpcEndpoint,
    });

    // Add access permissions to Cognito
    service.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: [
          "cognito-idp:RespondToAuthChallenge",
          "cognito-idp:ForgotPassword",
          "cognito-idp:ConfirmForgotPassword",
          "cognito-idp:AdminInitiateAuth",
        ],
        resources: [this.userPool.userPoolArn]
      })
    );

    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), 
      [
        `${service.node.path}/InstanceRole/DefaultPolicy/Resource`,
        `${service.node.path}/AccessRole/DefaultPolicy/Resource`,
      ], 
      [{
        id: 'AwsSolutions-IAM5',
        reason: 'To use ManagedPolicy for AppRunner service',
      }]
    );

    NagSuppressions.addResourceSuppressions(this.userPool, [{
      id: 'AwsSolutions-COG3',
      reason: "It's used on closed network"
    }]);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `${iceRecoveryFunction.node.path}/ServiceRole/DefaultPolicy/Resource`, [{
      id: 'AwsSolutions-IAM5',
      reason: 'To manage all instances',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `${schedulerExecutionRole.node.path}/DefaultPolicy/Resource`, [{
      id: 'AwsSolutions-IAM5',
      reason: 'To manage all instances',
    }]);
    NagSuppressions.addResourceSuppressions(iceRecoveryFunction.role!, [{
      id: 'AwsSolutions-IAM4',
      reason: 'To use ManagedPolicy for AppRunner service',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), [
      `/${Stack.of(this).stackName}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`
    ],[{
      id: 'AwsSolutions-IAM4',
      reason: 'To use ManagedPolicy for service',
    }])

    // Output commands to create initial admin user
    new CfnOutput(this, 'CreateAdminUserCommand', {
      description: 'Command to create initial admin user (replace REPLACE_WITH_ADMIN_EMAIL and REPLACE_WITH_INITIAL_PASSWORD)',
      value: [
        'aws cognito-idp admin-create-user \\',
        `  --user-pool-id ${this.userPool.userPoolId} \\`,
        '  --username REPLACE_WITH_ADMIN_EMAIL \\',
        '  --user-attributes Name=email,Value=REPLACE_WITH_ADMIN_EMAIL Name=email_verified,Value=true \\',
        `  --region ${this.region} && \\`,
        'aws cognito-idp admin-add-user-to-group \\',
        `  --user-pool-id ${this.userPool.userPoolId} \\`,
        '  --username REPLACE_WITH_ADMIN_EMAIL \\',
        '  --group-name Admins \\',
        `  --region ${this.region}`
      ].join('\n')
    });

  }
}
