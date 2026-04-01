FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-Dhttps.protocols=TLSv1.2,TLSv1.3", "-Djdk.tls.client.protocols=TLSv1.2,TLSv1.3", "-Djsse.enableSNIExtension=true", "-Dfile.encoding=UTF-8", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=70.0", "-jar", "app.jar"]
