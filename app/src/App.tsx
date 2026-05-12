import { BrowserRouter, Routes, Route, NavLink, Link } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Onboarding } from "./pages/Onboarding";
import { Browse } from "./pages/Browse";
import { Inbox } from "./pages/Inbox";
import { Reveal } from "./pages/Reveal";
import { HowItWorks } from "./pages/HowItWorks";
import { Federation } from "./pages/Federation";

export default function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <div className="nav-inner container">
          <Link to="/" className="brand">
            <span className="brand-mark">~/</span> Kindred
          </Link>
          <div className="nav-links">
            <NavLink to="/browse" className="nav-link">Browse</NavLink>
            <NavLink to="/inbox" className="nav-link">Inbox</NavLink>
            <NavLink to="/federation" className="nav-link">Federation</NavLink>
            <NavLink to="/how-it-works" className="nav-link">How it works</NavLink>
          </div>
        </div>
      </nav>
      <main className="container" style={{ paddingBottom: 96 }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/reveal/:matchId" element={<Reveal />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/federation" element={<Federation />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
