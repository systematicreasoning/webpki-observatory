import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@peculiar/certificates-viewer/dist/peculiar/peculiar.css';

createRoot(document.getElementById('root')).render(<App />);
