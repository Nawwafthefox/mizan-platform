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
            // Drop any unique indexes on sourceFileName — they block pg-import (all rows share same filename)
            String[] collections = {"branch_sales", "branch_purchases", "employee_sales", "mothan_transactions"};
            String[] legacyNames = {
                "unique_tenantId_sourceFileName_branch_sales",
                "unique_tenantId_sourceFileName_branch_purchases",
                "unique_tenantId_sourceFileName_employee_sales",
                "unique_tenantId_sourceFileName_mothan_transactions",
                "sourceFileName_1", "tenantId_1_sourceFileName_1",
                "tenantId_1_saleDate_1_employeeId_1_sourceFileName_1",
                "tenantId_1_saleDate_1_branchCode_1_sourceFileName_1",
                "tenantId_1_purchaseDate_1_branchCode_1_sourceFileName_1",
                "tenantId_1_transactionDate_1_branchCode_1_sourceFileName_1"
            };
            for (String col : collections) {
                for (String idx : legacyNames) {
                    try {
                        mt.indexOps(col).dropIndex(idx);
                        log.info("Dropped legacy unique index {} on {}", idx, col);
                    } catch (Exception ignored) {}
                }
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
