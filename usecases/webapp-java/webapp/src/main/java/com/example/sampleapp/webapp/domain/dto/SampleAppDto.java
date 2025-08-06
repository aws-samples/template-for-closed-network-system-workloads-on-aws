package com.example.sampleapp.webapp.domain.dto;

import java.io.Serializable;
import java.util.Date;
import org.springframework.stereotype.Component;
import lombok.Data;

@Data
@Component
public class SampleAppDto implements Serializable {
    private Integer id;
    private String name;
    private Boolean job0001Flag;
    private Boolean job0002Flag;
    private Boolean job0003Flag;
    private Boolean job0004Flag;
    private Boolean job0005Flag;
}
