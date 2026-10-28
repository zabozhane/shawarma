import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles.css';
import './admin.css';
import { Admin } from './Admin.jsx';
import { registerServiceWorker } from '../shared/push.js';

registerServiceWorker();
createRoot(document.getElementById('root')).render(<Admin />);
