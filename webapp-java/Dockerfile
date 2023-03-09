# For build
FROM amazoncorretto:17-alpine AS build
ENV HOME=/home/app
RUN mkdir -p $HOME
WORKDIR $HOME
ADD . $HOME
RUN ./gradlew build

# For app
FROM amazoncorretto:17-alpine
RUN apk update && apk add curl 
RUN curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /tmp/root.pem
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring
COPY --from=build /home/app/build/libs/webapp-java-0.0.1-SNAPSHOT.jar sampleapp.jar
CMD ["java","-jar","/sampleapp.jar"]
