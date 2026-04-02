package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data @Document("regions")
public class Region {
    @Id private String id;
    private String tenantId;
    private int pgId;           // original PG integer id
    private String name;
    private String color;
}
