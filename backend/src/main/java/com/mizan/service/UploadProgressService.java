package com.mizan.service;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UploadProgressService {
    private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final Map<String, String> tokens = new ConcurrentHashMap<>();

    public record TokenPair(String uploadId, String sseToken) {}

    public TokenPair createToken() {
        String uploadId = java.util.UUID.randomUUID().toString();
        String sseToken = java.util.UUID.randomUUID().toString();
        tokens.put(uploadId, sseToken);
        return new TokenPair(uploadId, sseToken);
    }

    public boolean validateToken(String uploadId, String token) {
        return token != null && token.equals(tokens.get(uploadId));
    }

    public SseEmitter createEmitter(String uploadId) {
        SseEmitter emitter = new SseEmitter(300_000L);
        emitters.put(uploadId, emitter);
        emitter.onCompletion(() -> { emitters.remove(uploadId); tokens.remove(uploadId); });
        emitter.onTimeout(() -> emitters.remove(uploadId));
        return emitter;
    }

    public void send(String uploadId, String eventName, Object data) {
        SseEmitter emitter = emitters.get(uploadId);
        if (emitter == null) return;
        try {
            emitter.send(SseEmitter.event().name(eventName)
                .data(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data)));
        } catch (IOException e) {
            emitters.remove(uploadId);
        }
    }

    public void complete(String uploadId) {
        SseEmitter emitter = emitters.remove(uploadId);
        if (emitter != null) emitter.complete();
        tokens.remove(uploadId);
    }
}
