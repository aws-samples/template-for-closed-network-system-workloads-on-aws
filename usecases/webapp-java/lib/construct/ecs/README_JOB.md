# EcsJob Construct

## Purpose

Create Job that uses Task of ECS Cluster on Fargate.
The Job has rerunability, state management, and error notification function.

## Required resources

- VPC that includes private isolated subnet
- VPC Endpoint for ECR, CloudWatch Logs, SNS, and SecretsManager
- ECR Repository
- DynamoDB table
- SNS Topic

## Required parameters (props)

- `auroraSecretEncryptionKeyArn` <string>: Encryption key ARN of aurora secret
- `cluster` <ecs.Cluster>: Cluster of ECS on Fargate
- `image` <ecs.EcrImage>: Container's image
- `table` <dynamodb.Table>: Store job invokation status each days
- `topic` <sns.Topic>: Sending error notification

## Optional parameters (props)

- `taskDefinitionEnvironments` <{[key: string]: string}>: Environments variables for task
- `taskDefinitionSecrets` <{[key: string]: ecs.Secret}>: Secrets environments variables for task
- `taskInput` <{[key: string]: any}>: Environments variables for statemachine of stepfunctions

## Properties

| Name         |                       Type                       |                                                                                        Description |
| ------------ | :----------------------------------------------: | -------------------------------------------------------------------------------------------------: |
| statemachine |            stepfunctions.StateMachine            |                                                                                                    |
| job          | stepfunctions_tasks.Step FunctionsStartExecution |                               A Step Functions Task to call StartExecution on child state machine. |
| task         |        aws_stepfunctions_tasks.EcsRunTask        | It's just task of stepfunctions. This task is defined as ECS's task that called from stepfunctions |
| taskRole     |                   aws_iam.Role                   |                                                         The role is to execute AWS APIs from task. |
