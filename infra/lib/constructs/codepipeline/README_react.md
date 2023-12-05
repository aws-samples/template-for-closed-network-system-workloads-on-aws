# CodePipelineServerless Construct

## Purpose

- Create CodePipeline to deploy to S3
  - Include CodeCommit and CodeBuild

## Required resources

- CodeCommit repository
- S3 bucket to deploy

## Required parameters (props)

- `codeCommitRepository` <aws_codecommit.IRepository>: CodeCOmmit Repository, Get source code from this repository
- `s3bucket` <aws_s3.Bucket>: S3 bucket, deploy destination

## Properties

None
