package com.mizan.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * DataInitializer — intentionally empty.
 *
 * All MongoDB operations (ensureIndex, tierRepo.count, saveAll) have been
 * removed from this class. They fired synchronously before the Atlas TLS
 * connection was established on Render, causing 30-second hangs and
 * MongoTimeoutException on every deploy.
 *
 * Subscription tiers were seeded once via mongorestore and live in Atlas.
 * Indexes are managed via the Atlas UI.
 */
@Slf4j
@Component
public class DataInitializer implements CommandLineRunner {

    @Override
    public void run(String... args) {
        log.info("DataInitializer: startup DB operations disabled — skipping.");
    }
}
