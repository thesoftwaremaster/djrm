import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './auth/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import AppLayout from './layouts/AppLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Enquiries = lazy(() => import('./pages/Enquiries'))
const Customers = lazy(() => import('./pages/Customers'))
const Bookings = lazy(() => import('./pages/Bookings'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Settings = lazy(() => import('./pages/Settings'))
const Security = lazy(() => import('./pages/Security'))
const Help = lazy(() => import('./pages/Help'))
const Login = lazy(() => import('./pages/Login'))
const CustomerDetails = lazy(() => import('./pages/CustomerDetails'))
const EnquiryDetails = lazy(() => import('./pages/EnquiryDetails'))
const InvoiceDetails = lazy(() => import('./pages/InvoiceDetails'))
const BookingDetails = lazy(() => import('./pages/BookingDetails'))

const RouteLoading = () => (
  <div className="rounded-2xl border border-border-soft bg-surface p-4 text-sm text-text-muted shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
    Loading...
  </div>
)

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <AppErrorBoundary>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>

                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/enquiries" element={<Enquiries />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/bookings" element={<Bookings />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/security" element={<Security />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/customers/:id" element={<CustomerDetails />} />
                  <Route path="/enquiries/:id" element={<EnquiryDetails />} />
                  <Route path="/invoices/:id" element={<InvoiceDetails />} />
                  <Route path="/bookings/:id" element={<BookingDetails />} />
                </Route>
              </Route>
            </Routes>
          </AppErrorBoundary>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
