import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com', // TODO: update with real API URL
  timeout: 10000,
});

export default api;
