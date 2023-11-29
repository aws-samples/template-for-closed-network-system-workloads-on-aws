import React, { useState, useEffect } from "react";
import { Record } from "../types/record";
import { HashRouter, Routes, Route, Link } from "react-router-dom";
import { RecordForm } from "./Form";
import { RecordList } from "./List";
import { get } from "../modules/requests";

export const Dashboard: React.FC<{}> = ({}) => {
    const [samplerecords, setSamplerecords] = React.useState<Record[]>([])
    useEffect(() => {(async()=>{
        const res=await get("sample/");
        setSamplerecords(res);
    })()},[]);
    return(<React.Fragment>
        <HashRouter>
        <h1>Hello From S3 through CodePipeline ! </h1><br/>            
                <Routes>
                    <Route path="/" Component={({}) => {return <RecordList records={samplerecords}/>}} />
                    <Route path="/sampleapp/form" Component={({}) => {return <RecordForm records={samplerecords} setRecords={setSamplerecords}/>}} />
                </Routes>
            
        </HashRouter>
    </React.Fragment>);
}

export default Dashboard;