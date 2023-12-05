# DefaultLambda Construct

## Purpose

Creates Lambda connecting RDS

## Required resources

- VPC including RDS

## Required parameters (props)

- `resourceId <string>` : Some unique name for Lambda function
- `entry <string>` : path for function code
- `auroraSecretName <string>` : Secret Name including RDS information
- `auroraSecretArn <string>` : Secret Arn including RDS information
- `auroraSecurityGroupId <string>`: Security Group Id including RDS
- `auroraSecretEncryptionKeyArn <string>` : KMS Key Arn which encrypt secret including RDS information
- `rdsProxyEndpoint <string>` : Endpoint url of RDS proxy endpoint
- `rdsProxyArn <string>` : ARN of RDS proxy endpoint
- `sgForLambda <aws_ec2.SecurityGroup>` : Security Group for Lambda
     

## Optional parameters (props)

None

## Properties
| Name   |   Type    | Description |
| ------ | :-------: | ----------: |
|  lambda |  aws_lambda_nodejs.NodejsFunction | lambda Function  |