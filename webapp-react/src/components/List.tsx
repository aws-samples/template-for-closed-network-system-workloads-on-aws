import React from "react";
import { Record } from "../types/record";

//mui
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Link } from "react-router-dom";

export const RecordList: React.FC<{records:Record[]}> = ({records}) => {
    return(<React.Fragment>
         <Link to="/sampleapp/form/"><Button variant="contained">変更する</Button></Link>
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
                {records.map((row:Record) => {
                    return (
                        <TableRow>
                            <TableCell>{row.id} </TableCell>
                            <TableCell>{row.name} </TableCell>
                            <TableCell>{row.job0001_flag ? "成功" : "失敗"} </TableCell>
                            <TableCell>{row.job0002_flag ? "成功" : "失敗"} </TableCell>
                            <TableCell>{row.job0003_flag ? "成功" : "失敗"} </TableCell>
                            <TableCell>{row.job0004_flag ? "成功" : "失敗"} </TableCell>
                            <TableCell>{row.job0005_flag ? "成功" : "失敗"} </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>  
    </React.Fragment>);
}

export default RecordList;