# Bastion Construct

## Purpose

- Create Windows/Linux bastion instance

## Required resources

- VPC and private isolated subnet

## Required parameters (props)

- `os <"Linux"|"Windows">` : Select whether Linux or Windows
- `vpc <IVpc>` : Define destionation to create an instance. It required isolated subnet
- `region <string>` : Region ID
- `auroraSecurityGroupId <string>` : To create security group for bastion to allow access to RDS from bastion

## Optional parameters (props)

- `instanceType <InstanceType>` : If you want to change instance type, please add it. Default is `t2-small`

## Properties

- None
