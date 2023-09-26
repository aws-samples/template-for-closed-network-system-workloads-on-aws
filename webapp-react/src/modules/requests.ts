import React, { useState, useEffect,Dispatch,SetStateAction } from "react";
import axios from 'axios';
import { Record } from '../types/record';
//CHANGE HERE same domain to infra/stage.js
const endpoint = "https://app.templateapp.local/apigw/";

export const getFromEndpoint =  async () => {
    const response = await axios.get(endpoint+'sample/');
    return response.data as Record[];
};

export const postToEndpoint = async (row:Record) => {
    return axios.post(endpoint+'sample/',null,{params:row})
};
