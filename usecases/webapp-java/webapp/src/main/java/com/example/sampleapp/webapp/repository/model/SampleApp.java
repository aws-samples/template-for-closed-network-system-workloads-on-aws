package com.example.sampleapp.webapp.repository.model;

import java.util.Date;
import javax.persistence.Column;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.Setter;
import lombok.RequiredArgsConstructor;
import lombok.ToString;

@RequiredArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(of = {"id"})
@ToString
@Table(name = "sampleapp_table", schema = "public")
public class SampleApp {
    @Id
    @Column(name = "id")
    private Integer id;
    @Column(name = "name")
    private String name;
    @Column(name = "job0001_flag")
    private Boolean job0001Flag;
    @Column(name = "job0002_flag")
    private Boolean job0002Flag;
    @Column(name = "job0003_flag")
    private Boolean job0003Flag;
    @Column(name = "job0004_flag")
    private Boolean job0004Flag;
    @Column(name = "job0005_flag")
    private Boolean job0005Flag;
}
