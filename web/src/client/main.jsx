import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles.css';
import './client.css';
import { App } from './App.jsx';
import { registerServiceWorker } from '../shared/push.js';

registerServiceWorker();
createRoot(document.getElementById('root')).render(<App />);
