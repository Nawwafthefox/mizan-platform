package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data @Document("v3_regions")
public class V3Region {
    @Id private String id;
    private int regionId;
    private String name;
    private String color;
    private String tenantId;
}
