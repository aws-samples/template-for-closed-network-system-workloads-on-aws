# CodePipelineWebappJava Construct

## Purpose

- Create CodePipeline to deploy to ECS/Fargate
  - Include CodeCommit and CodeBuild

## Required resources

- CodeCommit repository
- ECS TaskDefinition
- ECS Service
- ECS Cluster on Fargate.

## Required parameters (props)

- `codeCommitRepository` <aws_codecommit.IRepository>: CodeCOmmit Repository, Get source code from this repository
- `ecsService` <aws_ecs.FargateService>: ECS Service for Fargate, deploy destination

## Properties

None
