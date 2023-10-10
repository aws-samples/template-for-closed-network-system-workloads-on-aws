import React, { useState, useEffect,Dispatch,SetStateAction } from "react";
import axios from 'axios';
import { Record } from '../types/types';

export const get =  async (endpoint:string) => {
    const response = await axios.get(endpoint);
    return response.data as Record[];
};

export const post = async (endpoint:string,row:Record) => {
    return axios.post(endpoint,null,{params:row})
};
