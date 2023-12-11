import React, { useEffect, useState } from 'react';
import { Record } from '../types/record';
import { RecordForm } from './RecordForm';
import { RecordList } from './RecordList';
import { get } from '../modules/requests';
import { post } from '../modules/requests';
import Button from '@mui/material/Button';

const resource = 'sample/';

export const Dashboard: React.FC = () => {
  const [sampleRecords, setSampleRecords] = useState<Record[]>([]);
  const [formState, setFormState] = useState<boolean>(false);

  const setJobFlag = (id: number, jobFlagKey: string, newFlagValue: boolean) => {
    setSampleRecords((prevRecords) =>
      prevRecords.map((record) =>
        record.id === id ? { ...record, [jobFlagKey]: newFlagValue } : record,
      ),
    );
  };

  useEffect(() => {
    (async () => {
      const res = await get('sample/');
      setSampleRecords(res.data as Record[]);
    })();
  }, []);
  return (
    <React.Fragment>
      <h1>Hello From S3 through CodePipeline ! </h1>
      <br />
      {formState ? (
        <>
          <Button
            variant="contained"
            onClick={async () => {
              await post(resource, sampleRecords);
              setFormState(!formState);
            }}
          >
            更新
          </Button>
          <RecordForm records={sampleRecords} setFlagHandler={setJobFlag} />
        </>
      ) : (
        <>
          <Button
            variant="contained"
            onClick={() => {
              setFormState(!formState);
            }}
          >
            変更する
          </Button>
          <RecordList records={sampleRecords} />
        </>
      )}
    </React.Fragment>
  );
};

export default Dashboard;
