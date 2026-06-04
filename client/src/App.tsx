import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

export default function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/styleguide" element={<StyleGuide />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </>
    )
}
