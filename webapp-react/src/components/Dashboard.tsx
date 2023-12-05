import React, { useEffect } from "react";
import { Record } from "../types/record";
import { HashRouter, Routes, Route} from "react-router-dom";
import { RecordForm } from "./Form";
import { RecordList } from "./List";
import { get } from "../modules/requests";

export const Dashboard: React.FC = () => {
    const [sampleRecords, setSampleRecords] = React.useState<Record[]>([])
    useEffect(() => {(async()=>{
        const res=await get("sample/");
        setSampleRecords(res);
    })()},[]);
    return(<React.Fragment>
        <HashRouter>
        <h1>Hello From S3 through CodePipeline ! </h1><br/>            
                <Routes>
                    <Route path="/" Component={() => {return <RecordList records={sampleRecords}/>}} />
                    <Route path="/sampleapp/form" Component={() => {return <RecordForm records={sampleRecords} setRecords={setSampleRecords}/>}} />
                </Routes>
            
        </HashRouter>
    </React.Fragment>);
}

export default Dashboard;