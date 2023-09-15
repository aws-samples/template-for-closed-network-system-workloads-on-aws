import React, { useState, useEffect } from "react";
import { Record } from "../types/types";
import { HashRouter, Routes, Route, Link } from "react-router-dom";
import { RecordForm } from "./Form";
import { RecordList } from "./List";
import axios from "axios";


//mui
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Checkbox from '@mui/material/Checkbox';

//CHANGE HERE same domain to infra/stage.js
const endpoint = "https://app.templateapp.local/apigw/";
export const Dashboard: React.FC<{}> = ({}) => {
    const [samplerecord, setSamplerecord] = React.useState<Record[]>([])
    useEffect(()=>{
        axios.get(endpoint+'sample/')
        .then(function (response) {
            console.log("response:",response)
            const records=response.data as Record[];
            setSamplerecord(records);
        });
    },[]);
    return(<React.Fragment>
        <HashRouter>
        <h1>Hello From S3 through CodePipeline ! </h1><br/>

                
                <Routes>
                    <Route path="/" Component={({}) => {return <RecordList records={samplerecord}/>}} />
                    <Route path="/sampleapp/form" Component={({}) => {return <RecordForm records={samplerecord} setRecords={setSamplerecord}  endpoint={endpoint}/>}} />
                </Routes>
            
        </HashRouter>
    </React.Fragment>);
}

export default Dashboard;