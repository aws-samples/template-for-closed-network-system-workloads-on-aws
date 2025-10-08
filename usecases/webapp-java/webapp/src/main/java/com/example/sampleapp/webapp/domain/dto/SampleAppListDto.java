package com.example.sampleapp.webapp.domain.dto;

import java.io.Serializable;
import java.util.List;
import org.springframework.stereotype.Component;
import lombok.Data;

@Data
@Component
public class SampleAppListDto implements Serializable {

    private List<SampleAppDto> sampleAppList;
}
