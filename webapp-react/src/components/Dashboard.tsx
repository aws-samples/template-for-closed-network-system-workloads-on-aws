import React, { useEffect, useState } from 'react';
import { Record } from '../types/record';
import { RecordForm } from './RecordForm';
import { RecordList } from './RecordList';
import { get } from '../modules/requests';
import { post } from '../modules/requests';
import Button from '@mui/material/Button';

const resource = 'sample/';

export const Dashboard: React.FC<{mode:string;}> = ({mode}) => {
  const [sampleRecords, setSampleRecords] = useState<Record>({} as Record);
  const [formState, setFormState] = useState<boolean>(false);

  const setJobFlag = (id: number, jobFlagKey: string, newFlagValue: boolean) => {
    setSampleRecords((prevRecord) =>
      prevRecord.id === id ? { ...prevRecord, [jobFlagKey]: newFlagValue } : prevRecord,
    );
  };

  useEffect(() => {
    (async () => {
      const res = await get(resource);
      setSampleRecords(res.data as Record);
    })();
  }, []);
  return (
    <React.Fragment>
      <h1>Hello From S3 through CodePipeline ! </h1>
      <br />
      {mode=="update" ? 
        <React.Fragment>
            <a href="/index.html">
              <Button
                variant="contained"
                onClick={async () => {
                  await post(resource, sampleRecords);
                }}
              >
                更新
              </Button>
            </a>
            <RecordForm record={sampleRecords} setFlagHandler={setJobFlag} />
          </React.Fragment>
        : 
          <React.Fragment>
            <a href="/update/index.html">
              <Button
                variant="contained"
              >
                変更する
              </Button>
            </a>
            <RecordList record={sampleRecords} />
          </React.Fragment>
        }
   </React.Fragment>
  );
};

export default Dashboard;
