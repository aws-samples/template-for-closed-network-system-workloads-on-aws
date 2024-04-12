import axios from 'axios';

const API_ENDPOINT = import.meta.env.VITE_APP_ENDPOINT_URL;

export const get = async (resource: string, params?: { [key: string]: any }) => {
  return await axios.get(`${API_ENDPOINT}${resource}`, { params: params });
};

export const post = async (resource: string, data: any) => {
  return axios.post(`${API_ENDPOINT}${resource}`, data);
};
