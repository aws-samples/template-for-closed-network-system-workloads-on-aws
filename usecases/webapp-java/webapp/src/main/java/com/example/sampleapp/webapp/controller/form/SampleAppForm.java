package com.example.sampleapp.webapp.controller.form;

import java.util.Date;
import lombok.Data;
import javax.validation.constraints.NotBlank;


@Data
public class SampleAppForm {
    @NotBlank
    private Integer id;
    @NotBlank
    private String name;
    @NotBlank
    private Boolean job0001Flag;
    @NotBlank
    private Boolean job0002Flag;
    @NotBlank
    private Boolean job0003Flag;
    @NotBlank
    private Boolean job0004Flag;
    @NotBlank
    private Boolean job0005Flag;
}
