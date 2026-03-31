package com.mizan.dto;

/**
 * Holds uploaded file data as an in-memory byte array.
 * Multipart temp files are deleted when the HTTP request ends, so bytes
 * must be read synchronously in the controller before any async hand-off.
 */
public record FileBytes(String originalFilename, byte[] bytes) {}
