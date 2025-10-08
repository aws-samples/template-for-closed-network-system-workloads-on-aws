package com.example.sampleapp.webapp.domain;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.example.sampleapp.webapp.repository.*;
import com.example.sampleapp.webapp.repository.model.*;
import com.example.sampleapp.webapp.domain.dto.SampleAppDto;
import com.example.sampleapp.webapp.domain.dto.SampleAppListDto;

@Service
public class SampleAppService {
    @Autowired
    private SampleAppRepository repository;

    public SampleAppListDto listAll() {
        Iterable<SampleApp> data = repository.findAll();
        List<SampleAppDto> list = new ArrayList<SampleAppDto>();
        SampleAppListDto ret = new SampleAppListDto();

        for (SampleApp sampleApp : data) {
            SampleAppDto sampleAppDto = new SampleAppDto();

            sampleAppDto.setId(sampleApp.getId());
            sampleAppDto.setName(sampleApp.getName());
            sampleAppDto.setJob0001Flag(sampleApp.getJob0001Flag());
            sampleAppDto.setJob0002Flag(sampleApp.getJob0002Flag());
            sampleAppDto.setJob0003Flag(sampleApp.getJob0003Flag());
            sampleAppDto.setJob0004Flag(sampleApp.getJob0004Flag());
            sampleAppDto.setJob0005Flag(sampleApp.getJob0005Flag());

            list.add(sampleAppDto);
        }

        ret.setSampleAppList(list);
        return ret;
    }

    public void updateAll(SampleAppListDto sampleAppListDto) {
        List<SampleApp> sampleAppList = new ArrayList<SampleApp>();

        for (SampleAppDto sampleAppDto : sampleAppListDto.getSampleAppList()) {
            SampleApp sampleApp = repository.findById(sampleAppDto.getId()).get();
            sampleApp.setJob0001Flag(sampleAppDto.getJob0001Flag());
            sampleApp.setJob0002Flag(sampleAppDto.getJob0002Flag());
            sampleApp.setJob0003Flag(sampleAppDto.getJob0003Flag());
            sampleApp.setJob0004Flag(sampleAppDto.getJob0004Flag());
            sampleApp.setJob0005Flag(sampleAppDto.getJob0005Flag());
            sampleAppList.add(sampleApp);
        }
        repository.saveAll(sampleAppList);
    }



}
