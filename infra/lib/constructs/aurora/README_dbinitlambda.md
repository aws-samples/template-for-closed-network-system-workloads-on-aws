# DBinitLambda Construct

## Purpose

- Lambda for initialize DB

## Required resources

- RDS
- RDS proxy


## Required parameters (props)

- `vpc <aws_ec2.IVpc>` : Define the vpc including RDS
- `sgForLambda <aws_ec2.SecurityGroup>` : Security Group for Lambda
- `auroraSecretName <string>` : Secret Name including RDS information
- `auroraSecretArn <string>` : Secret Arn including RDS information
- `auroraSecretEncryptionKeyArn <string>` : KMS Key Arn which encrypt secret including RDS information
- `rdsProxyEndpoint <string>` : Endpoint url of RDS proxy endpoint
- `rdsProxyArn <string>` : ARN of RDS proxy endpoint
     
## Optional parameters (props)
None
## Properties
None