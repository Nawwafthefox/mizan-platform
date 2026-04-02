package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data @Document("branches")
public class Branch {
    @Id private String id;
    private String tenantId;
    private int pgId;           // original PG integer id
    private String name;
    private int regionId;
    private String regionName;
    private String regionColor;
}
