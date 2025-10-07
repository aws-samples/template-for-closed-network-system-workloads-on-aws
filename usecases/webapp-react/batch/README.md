# batch

[日本語で読む](./README_ja.md)

It's a sample job script that is called by Step Functions that are created by the CDK infra application.

## What does it do

The script will invoke SQL commands by `JOBID` given by Step Functions.
The queries will test `true` or `false` values that are stored in the database. If any returned value is `false` the script will output the record names to a file in S3. Also the job execution result is returned back to the step functions.

## How to use

The job is packed into a docker image that is pushed by this CDK application into ECR. You can trigger the job by the AWS Console or modifiy the job and deploy again to reflect the changes.

## Path to Production

- Please modify the script and modify the Dockerfile follow your environment.
- Please consider CI/CD for job scripts.
