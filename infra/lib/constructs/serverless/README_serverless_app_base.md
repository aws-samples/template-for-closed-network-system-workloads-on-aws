# ServerlessAppBase Construct

## Purpose

Create Lambda functions , S3 bucket for static contents and ALB to access services.

(Optional) Create Private Link to access to ALB.

## Required resources

- VPC that includes private isolated subnet

## Required parameters (props)
- `vpc <ec2.IVpc>`: Define the vpc including isolated subnets
- `domainName <string>`: Domain for websites
- `certificateArn <string>`: Certificate Arn for ALB
- `auroraSecretName <string>` : Secret Name including RDS information
- `auroraSecretArn <string>` : Secret Arn including RDS information
- `auroraSecurityGroupId <string>`: Security Group Id including RDS
- `auroraSecretEncryptionKeyArn <string>` : KMS Key Arn which encrypt secret including RDS information
- `auroraEdition <string>`: edition of aurora database
- `rdsProxyEndpoint <string>` : Endpoint url of RDS proxy endpoint
- `rdsProxyArn <string>` : ARN of RDS proxy endpoint

## Optional parameters (props)

- `privateLinkVpc`<ec2.IVpc>: It's required when `enabledPrivateLink` is true.

## Properties


| Name        |                      Type                      |                                   Description |
| ----------- | :--------------------------------------------: | --------------------------------------------: |
| alb |  aws_elasticloadbalancingv2.ApplicationLoadBalancer | |
| nlb | aws_elasticloadbalancingv2.NetworkLoadBalancer | |
| webappS3bucket |  aws_s3.Bucket | s3 bucket for static contents |
| sgForLambda | aws_ec2.SecurityGroup | Security group for Lambda which connects RDS |
