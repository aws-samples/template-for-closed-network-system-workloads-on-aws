# DefaultLambda Construct

## Purpose

Creates Lambda connecting RDS

## Required resources

- VPC including RDS

## Required parameters (props)

- `resourceId <string>` : Some unique name for Lambda function
- `entry <string>` : path for function code
- `secretName <string>` : Secret Name including RDS information
- `secretArn <string>` : Secret Arn including RDS information
- `secretEncryptionKeyArn <string>` : KMS Key Arn which encrypt secret including RDS information
- `proxyEndpoint <string>` : Endpoint url of RDS proxy endpoint
- `proxyArn <string>` : ARN of RDS proxy endpoint
- `sgForLambda <aws_ec2.SecurityGroup>` : Security Group for Lambda

## Optional parameters (props)

None

## Properties

| Name   |               Type               |     Description |
| ------ | :------------------------------: | --------------: |
| lambda | aws_lambda_nodejs.NodejsFunction | lambda Function |
