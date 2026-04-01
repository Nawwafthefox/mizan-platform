package com.mizan.config;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * Default @Async executor — used by UploadService.processAsync().
     * Named "taskExecutor" so Spring picks it up as the default @Async executor.
     * Must be a SEPARATE pool from uploadExecutor to avoid deadlock:
     * processAsync() blocks waiting for CompletableFutures on uploadExecutor —
     * if both share the same pool the blocking threads starve the parse tasks.
     */
    @Bean("taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(20);
        ex.setMaxPoolSize(50);
        ex.setQueueCapacity(200);
        ex.setThreadNamePrefix("async-");
        ex.initialize();
        return ex;
    }

    /** Used for parallel file parsing inside UploadService.processAsync(). */
    @Bean("uploadExecutor")
    public Executor uploadExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(6);
        ex.setMaxPoolSize(12);
        ex.setQueueCapacity(100);
        ex.setThreadNamePrefix("upload-");
        ex.initialize();
        return ex;
    }
}
