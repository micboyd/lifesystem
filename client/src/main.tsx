import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { DataSyncProvider } from './context/DataSyncContext'
import { CalendarsProvider } from './context/CalendarsContext'
import { ToastProvider } from './context/ToastContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <DataSyncProvider>
                    <CalendarsProvider>
                        <ToastProvider>
                            <App />
                        </ToastProvider>
                    </CalendarsProvider>
                </DataSyncProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
)
