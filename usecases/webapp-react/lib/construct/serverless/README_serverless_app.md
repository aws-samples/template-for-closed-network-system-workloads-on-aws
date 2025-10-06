# ServerlessApp Construct

## Purpose

Creates serverless application resources including API Gateway, Lambda functions, S3 bucket, and ALB target groups with improved architecture following Clean Architecture principles.

## Required resources

- VPC including subnets and VPC endpoints
- Database secret and proxy configuration
- S3 Interface VPC Endpoint

## Required parameters (props)

- `vpc <aws_ec2.IVpc>` : VPC for deploying resources
- `domainName <string>` : Domain name for the application
- `certificateArn <string>` : ARN of SSL certificate
- `dbSecretName <string>` : Secret Name including RDS information
- `dbSecretArn <string>` : Secret Arn including RDS information
- `dbSecurityGroupId <string>` : Security Group ID for database
- `dbSecretEncryptionKeyArn <string>` : KMS Key Arn which encrypt secret including RDS information
- `dbProxyEndpoint <string>` : Endpoint url of RDS proxy endpoint
- `dbProxyArn <string>` : ARN of RDS proxy endpoint
- `spaS3InterfaceEndpoint <aws_ec2.InterfaceVpcEndpoint>` : S3 Interface VPC Endpoint

## Optional parameters (props)

None

## Properties

| Name | Type | Description |
| ------ | :------------------------------: | --------------: |
| apiGw | ApiGw | API Gateway construct with enhanced addMethodWithLambdaIntegration |
| webappS3bucket | aws_s3.Bucket | S3 bucket for web application hosting |
| sgForLambda | aws_ec2.SecurityGroup | Security Group for Lambda functions |
| apiGwTargetGroup | aws_elasticloadbalancingv2.ApplicationTargetGroup | Target group for API Gateway |
| s3TargetGroup | aws_elasticloadbalancingv2.ApplicationTargetGroup | Target group for S3 VPC Endpoint |
| apiDomain | aws_apigateway.DomainName | API Gateway domain configuration |

