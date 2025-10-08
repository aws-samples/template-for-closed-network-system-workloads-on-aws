package com.example.sampleapp.webapp.repository;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;
import com.example.sampleapp.webapp.repository.model.*;;

@Repository
public interface SampleAppRepository extends CrudRepository<SampleApp, Integer> {

}
