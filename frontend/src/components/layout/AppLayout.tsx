import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { FloatingBot } from '../FloatingBot';

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 pt-[4.5rem]">
        <Outlet />
      </main>
      <Footer />
      {/* Floating AI bot — available on all authenticated pages */}
      <FloatingBot />
    </div>
  );
}

export default AppLayout;
