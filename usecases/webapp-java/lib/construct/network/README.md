# Network Construct

## Purpose

Creates a VPC enviroment with network logs enabled to Cloudwatch.

## Required resources

None

## Required parameters (props)

- `maxAzs` <number>: Max availability zones
- `cidr` <string>: The CIDR address of the network
- `cidrMask` <number>: The mask for the of available IP addresses in each subnet

## Optional parameters (props)

- `publicSubnet` <bool>: Create or not a public subnet
- `isolatedSubnet` <bool>: Create or not a isolated subnet
- `natSubnet` <bool>: Create or not a nat/private subnet

## Properties

| Name |   Type   | Description |
| ---- | :------: | ----------: |
| vpc  | ec2.IVpc | Exposed VPC |
