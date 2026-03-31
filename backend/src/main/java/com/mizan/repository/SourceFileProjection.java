package com.mizan.repository;

/** Spring Data MongoDB projection — fetches only the sourceFileName field. */
public interface SourceFileProjection {
    String getSourceFileName();
}
