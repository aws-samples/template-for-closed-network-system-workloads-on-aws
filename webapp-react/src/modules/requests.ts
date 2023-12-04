import axios from 'axios';
import { Record } from '../types/types';

export const get = async (resource: string) => {
  const response = await axios.get(process.env.REACT_APP_ENDPOINT_URL + resource);
  return response.data as Record[];
};

export const post = async (resource: string, row: Record) => {
  return axios.post(process.env.REACT_APP_ENDPOINT_URL + resource, null, { params: row });
};
