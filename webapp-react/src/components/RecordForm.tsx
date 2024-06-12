import React from 'react';
import { Record } from '../types/record';
import { RecordFormRow } from './RecordFormRow';
//mui
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export const RecordForm: React.FC<{
  record: Record;
  setFlagHandler: (id: number, jobFlagKey: string, newFlagValue: boolean) => void;
}> = ({ record, setFlagHandler }) => {
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
        <RecordFormRow record={record} setFlagHandler={setFlagHandler}></RecordFormRow>
      </TableBody>
    </Table>
  );
};

export default RecordForm;
