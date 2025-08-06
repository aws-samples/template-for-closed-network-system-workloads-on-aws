# webapp-java

[日本語で読む](./README_ja.md)

## Overview

This is a sample application in Java to test your deployment.

You can query the database within the application and you can check the operation of batch processing by selecting records that cause batch processing to fail.

## Run on local

### Requirements

- PostgresSQL

### Configure environment's variables

Please define 3 environment variables for the database connection:

```sh
export $DB_ENDPOINT=localhost
export $DB_USERNAME=<your_db_username>
export $DB_PASSWORD=<your_db_password>
```

### Initialize table and add sample data

The configuration of `spring.sqll.init.mode=always` is set in `src/resources/application.properties` that will always call `src/main/resources/data.sql` and `src/main/resources/schema.sql` to initialize the database.

These settings are for the purpose of this sample, please consider separately ways to initialize the database and perform the migration in production enviroments.

### Run the application

You can check the application by running the following command:

```sh
./gradlew bootRun
```

Access in your browser `http://localhost:8080`

### Sample screenshots

The application is running when you can see a list of results from the database:

![list page](./docs/images/screenshot.png)

## Building

Executing the following command will generate a jar file in `build/libs`.

```sh
./gradlew build
```
