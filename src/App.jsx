import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { WalletProvider } from './context/WalletContext.jsx';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import CreateProjectPage from './pages/CreateProjectPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import MilestonesPage from './pages/MilestonesPage.jsx';
import DisputesPage from './pages/DisputesPage.jsx';
import DisputeDetailPage from './pages/DisputeDetailPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import WalletPage from './pages/WalletPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import FreelancersPage from './pages/FreelancersPage.jsx';
import AvailableProjectsPage from './pages/AvailableProjectsPage.jsx';
import InvitationsPage from './pages/InvitationsPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/create" element={<CreateProjectPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/available-projects" element={<AvailableProjectsPage />} />
            <Route path="/freelancers" element={<FreelancersPage />} />
            <Route path="/invitations" element={<InvitationsPage />} />
            <Route path="/milestones" element={<MilestonesPage />} />
            <Route path="/disputes" element={<DisputesPage />} />
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </AuthProvider>
  );
}
