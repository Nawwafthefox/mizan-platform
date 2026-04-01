package com.mizan.config;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.config.AbstractMongoClientConfiguration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@Slf4j
@Configuration
@EnableMongoRepositories(basePackages = "com.mizan.repository")
// Mongo auto-config excluded in MizanApplication — this class owns all MongoDB beans
public class MongoConfig extends AbstractMongoClientConfiguration {

    @Value("${MONGODB_URI:mongodb://localhost:27017}")
    private String mongoUri;

    @Value("${MONGODB_DATABASE:mizan}")
    private String database;

    @Override
    protected String getDatabaseName() {
        return database;
    }

    @Override
    public MongoClient mongoClient() {
        return MongoClients.create(mongoUri);
    }

    @Override
    protected boolean autoIndexCreation() {
        return false;
    }

    /** Compound indexes on tenantId + date fields — speeds up delete + range queries. */
    @Bean
    CommandLineRunner ensureIndexes(MongoTemplate mt) {
        return args -> {
            // Drop legacy unique index on sourceFileName — causes DuplicateKeyException on re-upload
            try {
                mt.indexOps("employee_sales").dropIndex("sourceFileName_1");
                log.info("Dropped legacy unique index sourceFileName_1 on employee_sales");
            } catch (Exception ignored) {
                log.debug("sourceFileName_1 index not found on employee_sales — nothing to drop");
            }

            mt.indexOps("branch_sales")
                .ensureIndex(new Index().on("tenantId", Sort.Direction.ASC).on("saleDate", Sort.Direction.ASC));
            mt.indexOps("employee_sales")
                .ensureIndex(new Index().on("tenantId", Sort.Direction.ASC).on("saleDate", Sort.Direction.ASC));
            mt.indexOps("branch_purchases")
                .ensureIndex(new Index().on("tenantId", Sort.Direction.ASC).on("purchaseDate", Sort.Direction.ASC));
            mt.indexOps("mothan_transactions")
                .ensureIndex(new Index().on("tenantId", Sort.Direction.ASC).on("transactionDate", Sort.Direction.ASC));
            log.info("MongoDB compound indexes ensured for upload collections");
        };
    }
}
