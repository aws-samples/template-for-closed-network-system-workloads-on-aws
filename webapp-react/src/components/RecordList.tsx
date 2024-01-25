import React from 'react';
import { Record } from '../types/record';

//mui
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export const RecordList: React.FC<{ record: Record }> = ({ record }) => {
  return (
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
        <TableRow>
          <TableCell>{record.id} </TableCell>
          <TableCell>{record.name} </TableCell>
          <TableCell>{record.job0001_flag ? '成功' : '失敗'} </TableCell>
          <TableCell>{record.job0002_flag ? '成功' : '失敗'} </TableCell>
          <TableCell>{record.job0003_flag ? '成功' : '失敗'} </TableCell>
          <TableCell>{record.job0004_flag ? '成功' : '失敗'} </TableCell>
          <TableCell>{record.job0005_flag ? '成功' : '失敗'} </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
};

export default RecordList;
