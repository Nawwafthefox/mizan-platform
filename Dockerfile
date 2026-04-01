FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
COPY backend/pom.xml .
RUN mvn dependency:go-offline -q
COPY backend/src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-Dhttps.protocols=TLSv1.2,TLSv1.3", "-Djdk.tls.client.protocols=TLSv1.2,TLSv1.3", "-Djsse.enableSNIExtension=true", "-Dfile.encoding=UTF-8", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=70.0", "-jar", "app.jar"]
