# ApiGw Construct

## Purpose

Creates API Gateway for Serverless Architecture

## Required resources

- VPC including RDS

## Required parameters (props)

- `vpc <aws_ec2.IVpc>` : Define the vpc including RDS
- `auroraSecretName <string>` : Secret Name including RDS information
- `auroraSecretArn <string>` : Secret Arn including RDS information
- `auroraSecurityGroupId <string>`: Security Group Id including RDS
- `auroraSecretEncryptionKeyArn <string>` : KMS Key Arn which encrypt secret including RDS information
- `auroraEdition <string>`: edition of aurora database
- `rdsProxyEndpoint <string>` : Endpoint url of RDS proxy endpoint
- `rdsProxyArn <string>` : ARN of RDS proxy endpoint

## Optional parameters (props)

None

## Properties

| Name                     |                       Type                        |                           Description |
| ------------------------ | :-----------------------------------------------: | ------------------------------------: |
| vpcEndpointSecurityGroup |               aws_ec2.SecurityGroup               |       sg for API Gateway vpc endpoint |
| privateApiVpcEndpoint    |           aws_ec2.InterfaceVpcEndpoint            |              API Gateway vpc endpoint |
| privateApi               |           aws_apigateway.LambdaRestApi            |                           API Gateway |
| sgForLambda              |               aws_ec2.SecurityGroup               | sg for lambda which has to connect DB |
| addResource              | (resourceName: string) => aws_apigateway.Resource |   function for adding resource to API |
