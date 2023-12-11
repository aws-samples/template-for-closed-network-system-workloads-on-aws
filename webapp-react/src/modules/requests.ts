import axios from 'axios';
import { Record } from '../types/record';

const API_ENDPOINT = process.env.REACT_APP_ENDPOINT_URL;

export const get = async (resource: string) => {
  return await axios.get(`${API_ENDPOINT}${resource}`);
};

export const post = async (resource: string, data: any) => {
  return axios.post(`${API_ENDPOINT}${resource}`, data);
};
