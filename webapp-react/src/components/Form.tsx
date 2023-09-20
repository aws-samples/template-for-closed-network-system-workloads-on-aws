import React, { useState, useEffect } from "react";
import { Record } from "../types/record";
import { Dispatch,SetStateAction } from "react";
import { Link } from "react-router-dom";
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


export const RecordForm: React.FC<{records:Record[], setRecords:Dispatch<SetStateAction<Record[]>>,endpoint:string}> = ({records,setRecords,endpoint}) => {
    return(<React.Fragment>
        <Link to="/"><Button variant="contained">更新</Button></Link>
        <Table>
            <TableHead>
                <TableRow>
                    <TableCell rowSpan={2}> ID </TableCell>
                    <TableCell rowSpan={2}> 名前 </TableCell>
                    <TableCell colSpan={5}> ジョブの成否 </TableCell>
                </TableRow>
                <TableRow>
                    <TableCell> JOB0001 </TableCell>
                    <TableCell> JOB0002 </TableCell>
                    <TableCell> JOB0003 </TableCell>
                    <TableCell> JOB0004 </TableCell>
                    <TableCell> JOB0005 </TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {records.map((row:Record, index:number) => {
                    return (
                        <TableRow>
                            <TableCell>{row.id} </TableCell>
                            <TableCell>{row.name} </TableCell>
                            <TableCell><Checkbox checked={row.job0001_flag} onClick={()=>{
                                setRecords(records.map((obj) => (obj.id === row.id ? {...row,job0001_flag:!obj.job0001_flag} : obj)))
                                axios.post(endpoint+'sample/',null,{params:{...row,job0001_flag:!row.job0001_flag}})
                                    .then(function (response) {
                                        console.log("changed to",{...row,job0001_flag:!row.job0001_flag});
                                    });
                            }}/></TableCell>
                             <TableCell><Checkbox checked={row.job0002_flag} onClick={()=>{
                                setRecords(records.map((obj) => (obj.id === row.id ? {...row,job0002_flag:!obj.job0002_flag} : obj)))
                                axios.post(endpoint+'sample/',null,{params:{...row,job0002_flag:!row.job0002_flag}})
                                    .then(function (response) {
                                        console.log("changed to",{...row,job0002_flag:!row.job0002_flag});
                                    });
                            }}/></TableCell>
                             <TableCell><Checkbox checked={row.job0003_flag} onClick={()=>{
                                setRecords(records.map((obj) => (obj.id === row.id ? {...row,job0003_flag:!obj.job0003_flag} : obj)))
                                axios.post(endpoint+'sample/',null,{params:{...row,job0003_flag:!row.job0003_flag}})
                                    .then(function (response) {
                                        console.log("changed to",{...row,job0003_flag:!row.job0003_flag});
                                    });
                            }}/></TableCell>
                             <TableCell><Checkbox checked={row.job0004_flag} onClick={()=>{
                                setRecords(records.map((obj) => (obj.id === row.id ? {...row,job0004_flag:!obj.job0004_flag} : obj)))
                                axios.post(endpoint+'sample/',null,{params:{...row,job0004_flag:!row.job0004_flag}})
                                    .then(function (response) {
                                        console.log("changed to",{...row,job0004_flag:!row.job0004_flag});
                                    });
                            }}/></TableCell>
                             <TableCell><Checkbox checked={row.job0005_flag} onClick={()=>{
                                setRecords(records.map((obj) => (obj.id === row.id ? {...row,job0005_flag:!obj.job0005_flag} : obj)))
                                axios.post(endpoint+'sample/',null,{params:{...row,job0005_flag:!row.job0005_flag}})
                                    .then(function (response) {
                                        console.log("changed to",{...row,job0005_flag:!row.job0005_flag});
                                    });
                            }}/></TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    </React.Fragment>);
}

export default RecordForm;