package com.mizan.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.config.AbstractMongoClientConfiguration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;
import java.util.concurrent.TimeUnit;

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
        // 7A: Connection pool tuned for Render free tier (limited memory, 30s timeout)
        return MongoClients.create(MongoClientSettings.builder()
            .applyConnectionString(new ConnectionString(mongoUri))
            .applyToConnectionPoolSettings(b -> b
                .maxSize(5)                              // cap connections (Render free memory)
                .minSize(1)                              // keep 1 alive to avoid cold reconnects
                .maxConnectionIdleTime(60, TimeUnit.SECONDS))
            .applyToSocketSettings(b -> b
                .connectTimeout(5, TimeUnit.SECONDS)     // fail fast on connect
                .readTimeout(30, TimeUnit.SECONDS))      // match Render's HTTP timeout
            .applyToClusterSettings(b -> b
                .serverSelectionTimeout(5, TimeUnit.SECONDS))
            .build());
    }

    @Override
    protected boolean autoIndexCreation() {
        return false;
    }

    /** 7B: Warm-up ping — establishes MongoDB connection on boot so first request is fast. */
    @Bean
    CommandLineRunner mongoWarmup(MongoTemplate mt) {
        return args -> {
            long t0 = System.currentTimeMillis();
            mt.getDb().runCommand(new Document("ping", 1));
            log.info("MongoDB warm-up ping: {}ms", System.currentTimeMillis() - t0);
            long salesCount = mt.count(new Query(), "v3_sale_transactions");
            log.info("v3_sale_transactions count: {} ({}ms total)", salesCount, System.currentTimeMillis() - t0);
        };
    }

    /**
     * Compound indexes — covers all $match patterns used by aggregation pipelines.
     * Each call is wrapped in try-catch so a single failure doesn't abort startup.
     * For 22K documents: index scan ~5ms vs collection scan ~500ms.
     */
    @Bean
    CommandLineRunner ensureIndexes(MongoTemplate mt) {
        return args -> {
            // ── Drop legacy unique indexes on sourceFileName (block pg-import) ─
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
                    try { mt.indexOps(col).dropIndex(idx); }
                    catch (Exception ignored) {}
                }
            }

            // ── V1 legacy collections ─────────────────────────────────────────
            // {tenantId, date} — covers delete + range queries
            idx(mt, "branch_sales",         new Index().on("tenantId", Sort.Direction.ASC).on("saleDate",        Sort.Direction.ASC));
            idx(mt, "employee_sales",        new Index().on("tenantId", Sort.Direction.ASC).on("saleDate",        Sort.Direction.ASC));
            idx(mt, "branch_purchases",      new Index().on("tenantId", Sort.Direction.ASC).on("purchaseDate",    Sort.Direction.ASC));
            idx(mt, "mothan_transactions",   new Index().on("tenantId", Sort.Direction.ASC).on("transactionDate", Sort.Direction.ASC));

            // ── V3 BCNF collections ───────────────────────────────────────────
            // date-first: aggregation $match is always tenantId + date range across all branches
            idx(mt, "v3_sale_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("saleDate",        Sort.Direction.ASC).on("branchCode", Sort.Direction.ASC));
            // branchCode-first: kept for branch-scoped lookups
            idx(mt, "v3_sale_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("branchCode",      Sort.Direction.ASC).on("saleDate",   Sort.Direction.ASC));
            // karat lookup: karat breakdown aggregation filters/groups on branchCode + karat
            idx(mt, "v3_sale_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("branchCode",      Sort.Direction.ASC).on("karat",      Sort.Direction.ASC));

            idx(mt, "v3_employee_sale_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("saleDate",        Sort.Direction.ASC).on("empId",      Sort.Direction.ASC));
            idx(mt, "v3_employee_sale_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("empId",           Sort.Direction.ASC).on("saleDate",   Sort.Direction.ASC));

            idx(mt, "v3_purchase_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("purchaseDate",    Sort.Direction.ASC).on("branchCode", Sort.Direction.ASC));
            idx(mt, "v3_purchase_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("branchCode",      Sort.Direction.ASC).on("purchaseDate", Sort.Direction.ASC));

            idx(mt, "v3_mothan_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("transactionDate", Sort.Direction.ASC));
            idx(mt, "v3_mothan_transactions",
                new Index().on("tenantId", Sort.Direction.ASC).on("branchCode",      Sort.Direction.ASC).on("transactionDate", Sort.Direction.ASC));

            log.info("All MongoDB indexes ensured");
        };
    }

    /** Resilient ensureIndex — logs a warning instead of crashing startup on failure. */
    private void idx(MongoTemplate mt, String collection, Index index) {
        try {
            mt.indexOps(collection).ensureIndex(index);
        } catch (Exception e) {
            log.warn("Index creation skipped for {}: {}", collection, e.getMessage());
        }
    }
}
