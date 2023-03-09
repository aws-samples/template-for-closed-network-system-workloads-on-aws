# EcsAppService Construct

## Purpose

Create Service, TaskDefinition, and Container for ECS on Fargate.
And register the service to TargetGroup of ALB to connect from it.

## Required resources

- VPC that includes private isolated subnet
- VPC Endpoint for ECR, CloudWatch Logs, and SecretsManager
- RDS(Aurora or others)
- ECR Repository

## Required parameters (props)

- `auroraSecretName`<string>: Aurora's secrets name(key)
- `auroraSecurityGroupId`<string>: To define TaskDefinition's SecurityGroup
- `auroraSecretEncryptionKeyArn`<string>: Encryption key ARN of aurora secret
- `cluster`<ecs.Cluster>: Service and Tasks works on this cluster
- `repository`<ecr.IRepository>: Container Registory to get container image
- `targetGroup`<elasticloadbalancingv2.ApplicationTargetGroup>: Destination to register ECS services

## Properties

| Name         |          Type           | Description |
| ------------ | :---------------------: | ----------: |
| ecsService   |   ecs.FargateService    |             |
| ecsContainer | ecs.ContainerDefinition |             |
