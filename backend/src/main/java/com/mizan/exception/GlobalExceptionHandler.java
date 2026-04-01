package com.mizan.exception;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<?> handleSecurity(SecurityException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(Map.of("success",false,"error","ACCESS_DENIED","message",e.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<?> handleState(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
            .body(Map.of("success",false,"error","SUBSCRIPTION_REQUIRED","message",e.getMessage(),
                "messageAr","للاشتراك تواصل مع ميزان"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<?> handleArg(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(Map.of("success",false,"error","VALIDATION_ERROR","message",e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleGeneral(Exception e) {
        log.error("Unhandled exception: {}", e.getMessage(), e);
        String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        String cause = e.getCause() != null ? e.getCause().getMessage() : null;
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(cause != null
                ? Map.of("success",false,"error","INTERNAL_ERROR","message",msg,"cause",cause)
                : Map.of("success",false,"error","INTERNAL_ERROR","message",msg));
    }
}
