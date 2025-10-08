# Template for Closed Network System Workloads on AWS

[日本語で読む](./README_ja.md)

It assumes a closed network scenario and is a template for deploying applications and batch systems accessible from that environment to AWS.
It consists of AWS CDK and Web server sample applications that via CI/CD (AWS CodePipelie) will be deployed to private networks.

In local government systems that require a high level security and network restrictions, we need to configure our architecture with characteristics from on-premise, like "Closed area networks" and "Allow NW access routes from AWS to on-premise network". We designed the template so that these type of systems can be deployed on AWS.

We will adopt REPLATFORM, one of the 6Rs, which is AWS's migration strategy, and aims to migrate from an existing on-premise environment to computing and managed DB using containers. REPLATFORM has advantages such as improving performance and reducing costs. The template uses several AWS managed services that will help us to reduce cost and operational workload.
(Ref：[Migrating to AWS Best Practices and Strategies](https://pages.awscloud.com/rs/112-TZM-766/images/Migrating-to-AWS_Best-Practices-and-Strategies_eBook.pdf)

And we added serverless application version of infra that uses AWS Lambda and React application instead of container.
Please see here you want to know how to deploy serverless application version.

## Scope

### What the template provides

- Container execution environment for running Java applications (Spring boot) on Amazon ECS/Fargate

  - In addition to this, a sample application using Spring Boot
  - A sample Dockerfile to turn that sample application into a container image
  - For sample applications, see [`Webapp-java/readme.md`](./webapp-java/README.md)

- Serverless application environment for running React application hosted on Amazon S3 and REST API on API Gateway and AWS Lambda.(\*)

  - A sample application using React
  - For sample react application, see [`Webapp-react/readme.md`](./webapp-react/README.md).
  - Sample REST APIs code is in `functions/`

- CI/CD environment for continuous application development

  - Pipeline for building and deploying the above sample applications using CodePipeline, CodeCommit, and CodeBuild
  - A job execution platform combining Step Functions and Amazon ECS/Fargate that can execute simple job flows

- In addition to this, a Python sample job script

  - A sample Dockerfile for turning the sample job script into a container image
  - For a sample job script, see [`batch/README.md`](./batch/README.md)

- Maintenance environment for checking application operation and managing RDB
  - A secure access where you can test applications and manage databases combining SystemsManager and EC2
  - Provides remote desktop connections (Windows Server Instances) and SSH connections (Amazon Linux Instances)

### What the template doesn't provide

- Settings and implementation on the AWS side involved in on-premise connections such as AWS Direct Connect (DX) and AWS Site-to-Site VPN (VPN)
  - Please design and implement DX and VPN, which are likely to be necessary for actual use on the user's side
- Application authentication function
  - Since this application is a sample, it does not have authentication or authorization functions such as login/logout
- DNS settings for applications
  - To check the operation of this template, we will use an endpoint that AWS automatically creates for the ALB
- Operation features
  - It does not have integrated management of application and AWS resource logs or the ability to alert and monitor applications

## Directories

This is the directory tree and its overview.

| Directory | Sub directory    | Description                                                                                                                                                                                                                                                                                     |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| docs      |                  | Project-wide documentation and image files                                                                                                                                                                                                                                                      |
|           | images           | Architecture diagrams, screenshots, and other image files                                                                                                                                                                                                                                       |
| usecases  |                  | Use case-specific project directories                                                                                                                                                                                                                                                           |
|           | webapp-java      | Spring Boot web application and batch system sample<br>Provides ECS/Fargate container execution environment, Aurora PostgreSQL, CI/CD pipeline, and batch job management<br>See [`usecases/webapp-java/README.md`](./usecases/webapp-java/README.md) for details                          |
|           | webapp-react     | React web application and serverless environment sample<br>Provides ECS/Fargate or serverless React application execution environment<br>See [`usecases/webapp-react/README.md`](./usecases/webapp-react/README.md) for details                                                            |
|           | infraops-console | AWS resource management console for closed network environments<br>Remix-based web application for integrated management of EC2, ECS, RDS resources with ABAC (Attribute-Based Access Control)<br>See [`usecases/infraops-console/README.md`](./usecases/infraops-console/README.md) for details |

## Requirement

- `Node.js` >= `22.0.0`
- `npm` >= `9.2.0`
- `aws-cdk` >= `2.1022.0`
- `aws-cdk-lib` >= `2.206.0`
- `TypeScript` >= `5.6.0`
- `OpenSSL` >= `3.0.8`
- `Docker`

## Architecture

### NW configuration assumptions

It is assumed that the on-premise NW (on the right side of the image bellow) exists and the AWS network will be connected via Direct Connect or VPN.

![Connection scheme overview diagram](./docs/images/prerequirsite_en.png)

### Using Private Link

The template, optionally allows you to provision the architecture by using Private Links. It is recommended for an extra layer of security when designing applications that are deployed in Private networks.

This is the architecture diagram that is slightly modified by using private links for the services:

![Private Link Version](./docs/images/template_architecture_privatelink_en.png)

## How to Deploy

Please see the following document: [infra/README.md](./infra/README.md)
If you want to deploy serverless application version, please see the following document: [infra/README_serverless.md](./infra/README_serverless.md)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#Security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
