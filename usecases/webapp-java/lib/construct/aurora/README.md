# Aurora Construct

## Purpose

- Create a credential for Aurora
- Create Aurora Cluster or Aurora Serverless (v1)
- Create RDS Proxy for Aurora Cluster

## Required resources

- VPC and private isolated subnet

## Required parameters (props)

- `enabledServerless <boolean>` : Select whether Aurora Serverless or not
- `auroraEdition <IClusterEngine>` : Define Aurora Engine
  > ### Note
  >
  > Aurora Serverless v1 supports `PostgreSQL Ver 10.18` or` MySQL 5.6/5.7`
- `vpc <Vpc>` : Define the vpc including isolated subnets
- `dbUserName <string>` : Database username for db credentials

## Optional parameters (props)

- `enabledProxy<boolean>` : Create RDS proxy and this proxy attached to Aurora clustrer if this props is `true`

## Properties

| Name                |                 Type                 |                                      Description |
| ------------------- | :----------------------------------: | -----------------------------------------------: |
| aurora              | DatabaseCluster or ServerlessCluster |                                        An Aurora |
| proxy               |            DatabaseProxy             |                                      A RDS proxy |
| databaseCredentials |             Credentials              | A Secrets Manager for storing databse credential |
| proxyRole           |                 Role                 |                                                  |
