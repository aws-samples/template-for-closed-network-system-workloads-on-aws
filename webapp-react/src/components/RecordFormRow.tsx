import React from 'react';
import { Record } from '../types/record';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';

export const RecordFormRow: React.FC<{
  record: Record;
  setFlagHandler: Function;
}> = ({ record, setFlagHandler }) => {
  return (
    <TableRow>
      <TableCell>{record.id} </TableCell>
      <TableCell>{record.name} </TableCell>
      <TableCell>
        <Checkbox
          checked={record.job0001_flag}
          onClick={() => setFlagHandler(record.id, 'job0001_flag', !record.job0001_flag)}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={record.job0002_flag}
          onClick={() => setFlagHandler(record.id, 'job0002_flag', !record.job0002_flag)}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={record.job0003_flag}
          onClick={() => setFlagHandler(record.id, 'job0003_flag', !record.job0003_flag)}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={record.job0004_flag}
          onClick={() => setFlagHandler(record.id, 'job0004_flag', !record.job0004_flag)}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={record.job0005_flag}
          onClick={() => setFlagHandler(record.id, 'job0005_flag', !record.job0005_flag)}
        />
      </TableCell>
    </TableRow>
  );
};
