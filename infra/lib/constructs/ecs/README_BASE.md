# EcsAppBase Construct

## Purpose

Create ECS Cluster on Fargate and ALB to access ECS Services on its cluster.
(Optional) Create Private Link to access to ALB.

## Required resources

- VPC that includes private isolated subnet

## Required parameters (props)

- `enabledPrivateLink`<boolean>: Whether using private link or not
- `vpc`<ec2.IVpc>: Define the vpc including isolated subnets

## Optional parameters (props)

- `privateLinkVpc`<ec2.IVpc>: It's required when `enabledPrivateLink` is true.
- `testVpcCidr`<string>: CIDR of VPC that Test stack's instance(Windows Server) works on

## Properties

| Name        |                      Type                      |                                   Description |
| ----------- | :--------------------------------------------: | --------------------------------------------: |
| cluster     |                  ecs.Cluster                   |                Created ECS CLuster on Fargate |
| targetGroup |  elaticloadbalancingv2.ApplicationTargetGroup  | It includes services and tasks on ECS/Fargate |
| alb         | elasticloadbalancingv2.ApplicationLoadBalancer |                   front of ECS Services/Tasks |
| nlb         |   elasticloadbalancingv2.NetworkLoadBalancer   |       Front of alb to connect via PrivateLink |
